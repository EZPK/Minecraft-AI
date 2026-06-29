import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Bot } from "./bot.js";
import type { ChatRouter } from "./chat.js";
import { SkillApi, type Skill } from "./skill-api.js";

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
    const files = (await readdir(this.dir)).filter((f) => f.endsWith(".js"));
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
    const api = new SkillApi(this.bot, this.chat, this.isAlive);
    const result = await withTimeout(fn(api, args), timeoutMs, name);
    const logs = api.getLogs();
    console.log(`[skill:run] ${name} done — result: ${safeStringify(result)}`);
    return { result, logs };
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

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  name: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Skill "${name}" timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
