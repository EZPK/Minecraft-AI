import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Bot } from "./bot.js";
import type { ChatRouter } from "./chat.js";
import { SkillApi, type Skill } from "./skill-api.js";
import { withTimeout } from "./util.js";

const SKILL_NAME_RE = /^[a-z][a-z0-9_]*$/;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface SkillInfo {
  name: string;
  description: string;
}

/**
 * Loads, stores and runs agent-authored skills from a directory. Each skill is
 * an ESM module whose default export is `(skills, args) => Promise<any>`.
 * Skills are hot-reloaded on every run (cache-busted import) so the agent can
 * edit a skill and immediately re-run it.
 */
export class SkillRuntime {
  constructor(
    private readonly dir: string,
    private readonly bot: Bot,
    private readonly chat: ChatRouter,
    private readonly isAlive: () => boolean = () => true,
  ) {}

  async init(): Promise<void> {
    if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true });
  }

  private pathFor(name: string): string {
    return join(this.dir, `${name}.js`);
  }

  async list(): Promise<SkillInfo[]> {
    if (!existsSync(this.dir)) return [];
    // Skip `_`-prefixed files (e.g. throwaway diagnostics) so they don't pollute
    // the agent's view of its real capabilities. The `_archive/` subdir is also
    // ignored since readdir is non-recursive.
    const files = (await readdir(this.dir)).filter(
      (f) => f.endsWith(".js") && !f.startsWith("_"),
    );
    const infos: SkillInfo[] = [];
    for (const file of files) {
      const name = file.replace(/\.js$/, "");
      const src = await readFile(join(this.dir, file), "utf8");
      infos.push({ name, description: firstDocLine(src) });
    }
    return infos;
  }

  async save(name: string, code: string): Promise<string> {
    if (!SKILL_NAME_RE.test(name)) {
      throw new Error(
        `Invalid skill name "${name}". Use lowercase letters, digits and underscores, starting with a letter.`,
      );
    }
    await this.init();
    const path = this.pathFor(name);
    await writeFile(path, code, "utf8");
    console.log(`[skill:save] ${name} → ${path}`);
    return path;
  }

  async run(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<{ result: unknown; logs: string[] }> {
    const path = this.pathFor(name);
    if (!existsSync(path)) {
      throw new Error(`Skill "${name}" does not exist. Save it first.`);
    }
    // Cache-bust so edits take effect without restarting the process.
    const url = `${pathToFileURL(path).href}?v=${Date.now()}`;
    const mod = (await import(url)) as { default?: Skill };
    const fn = mod.default;
    if (typeof fn !== "function") {
      throw new Error(
        `Skill "${name}" must export a default async function (skills, args).`,
      );
    }

    const argsStr = Object.keys(args).length ? ` ${JSON.stringify(args)}` : "";
    console.log(`[skill:run] ${name}${argsStr}`);
    // Cooperative cancellation: on timeout/cleanup/disconnect we abort the signal
    // so the skill's next `await skills.wait()` throws and its loop unwinds,
    // instead of running on forever in the background.
    const controller = new AbortController();

    // Abort immediately when the bot disconnects — don't wait for the 120s timeout.
    const onEnd = () => {
      controller.abort(new Error("bot disconnected"));
      try { this.bot.pathfinder?.setGoal(null); } catch { /* already gone */ }
    };
    this.bot.once("end", onEnd);

    const api = new SkillApi(this.bot, this.chat, controller.signal);
    const skillPromise = fn(api, args);
    // The orphaned loop may reject late (after abort) — swallow it so it doesn't
    // surface as an unhandled rejection.
    skillPromise.catch(() => {});
    try {
      const result = await withTimeout(skillPromise, timeoutMs, `Skill "${name}"`);
      const logs = api.getLogs();
      console.log(`[skill:run] ${name} done — result: ${safeStringify(result)}`);
      return { result, logs };
    } finally {
      this.bot.removeListener("end", onEnd);
      // A skill may time out or throw mid-action, leaving the bot in a dirty
      // state (held control keys, an active pathfinder goal, a running
      // collectBlock task). Abort the skill and reset so the next command starts
      // clean instead of the bot digging/walking on its own — and so orphaned
      // loops don't pile up and exhaust memory.
      controller.abort();
      if (this.isAlive()) {
        this.bot.clearControlStates();
        this.bot.pathfinder.setGoal(null);
        await this.bot.collectBlock.cancelTask().catch(() => {});
      }
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function firstDocLine(src: string): string {
  const match = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (match) {
    const line = match[1]!
      .split("\n")
      .map((l) => l.replace(/^\s*\*?\s?/, "").trim())
      .find((l) => l.length > 0);
    if (line) return line;
  }
  const comment = src.match(/^\s*\/\/\s*(.+)$/m);
  return comment ? comment[1]!.trim() : "(no description)";
}
