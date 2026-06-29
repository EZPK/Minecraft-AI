import { join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AppConfig } from "../config.js";
import { createBot, type Bot } from "../bot.js";
import { ChatRouter } from "../chat.js";
import { SkillRuntime } from "../skills-runtime.js";
import { SkillApi } from "../skill-api.js";
import { createMinecraftTools } from "../tools/index.js";
import { AgentBrain } from "../agent.js";
import { BotTelemetry } from "../telemetry.js";
import { InMemoryMemory } from "../memory.js";
import type {
  EpisodeTelemetry,
  Scenario,
  ScenarioRun,
  WorldSnapshot,
} from "./scenario.js";

/** Fixed coordinate the bot returns to before each episode (no /tp rights). */
export interface Arena {
  x: number;
  y: number;
  z: number;
}

/**
 * Boots the bot exactly like `src/index.ts:runSession`, but drives it headless:
 * a scenario's goal is injected via `AgentBrain.handle` instead of in-game chat,
 * telemetry is tapped for fitness, and the world is snapshotted before/after.
 *
 * One harness instance can run many scenarios in sequence; it returns the bot to
 * a fixed arena between episodes for a roughly repeatable starting context on a
 * world we cannot reset.
 */
export class EvalHarness {
  private bot!: Bot;
  private chat!: ChatRouter;
  private skillApi!: SkillApi;
  private telemetry!: BotTelemetry;
  private brain!: AgentBrain;

  /** Session telemetry for the current episode; reset per scenario. */
  private sessionStats = { toolCalls: 0, toolErrors: 0, retries: 0 };

  constructor(
    private readonly config: AppConfig,
    private readonly arena: Arena,
    private readonly cwd: string = process.cwd(),
  ) {}

  async boot(): Promise<void> {
    this.bot = await createBot(this.config.minecraft);
    const selfName = this.bot.username ?? this.config.minecraft.username;
    console.log(`[eval] spawned as "${selfName}".`);

    this.chat = new ChatRouter(this.bot, selfName);
    this.skillApi = new SkillApi(this.bot, this.chat);
    this.telemetry = new BotTelemetry(this.bot);
    this.telemetry.start();

    const skills = new SkillRuntime(join(this.cwd, "skills"), this.bot, this.chat);
    await skills.init();
    // Non-persistent memory keeps scored episodes reproducible.
    const memory = new InMemoryMemory();
    const tools = createMinecraftTools({ bot: this.bot, chat: this.chat, skills, memory });

    this.brain = new AgentBrain({
      // Headless eval shares the live server; never broadcast thoughts there.
      config: { ...this.config, narrate: false },
      chat: this.chat,
      customTools: tools,
      cwd: this.cwd,
      memory,
      // Stay reproducible: don't resume a live session.
      resumeSession: false,
      onEvent: (e) => this.onSessionEvent(e),
    });
    await this.brain.start();
  }

  /** Run one scenario once and return its scored result. */
  async runScenario(s: Scenario): Promise<ScenarioRun> {
    await this.returnToArena();

    const before = this.snapshot();
    const skipped = s.precondition?.(this.bot, before) ?? null;
    if (skipped) {
      console.log(`[eval] ${s.id}: precondition not met — ${skipped} (skipped)`);
    }

    this.telemetry.reset();
    this.sessionStats = { toolCalls: 0, toolErrors: 0, retries: 0 };

    const start = Date.now();
    const timedOut = skipped ? false : await this.runGoal(s.goalPrompt, s.timeoutMs);
    const durationMs = Date.now() - start;

    const after = this.snapshot();
    const telemetry: EpisodeTelemetry = {
      toolCalls: this.sessionStats.toolCalls,
      toolErrors: this.sessionStats.toolErrors,
      retries: this.sessionStats.retries,
      deaths: this.telemetry.counters.deaths,
      pathFailures: this.telemetry.counters.pathFailures,
      timedOut,
      durationMs,
    };

    const fitness = skipped
      ? { score: 0, components: { skipped: 0 } }
      : s.fitness(before, after, telemetry);

    return { scenarioId: s.id, before, after, telemetry, fitness, skipped };
  }

  async shutdown(): Promise<void> {
    await this.brain.abort().catch(() => {});
    this.telemetry.stop();
    try {
      this.bot.quit("eval done");
    } catch {
      /* already disconnected */
    }
  }

  // --- internals -----------------------------------------------------------

  private onSessionEvent(e: AgentSessionEvent): void {
    if (e.type === "tool_execution_end") {
      this.sessionStats.toolCalls++;
      if (e.isError) this.sessionStats.toolErrors++;
    } else if (e.type === "auto_retry_start") {
      this.sessionStats.retries++;
    }
  }

  /**
   * Inject the goal and wait for the agent turn to settle, the timeout to fire,
   * or the bot to die — whichever comes first. Returns whether it timed out.
   */
  private async runGoal(goal: string, timeoutMs: number): Promise<boolean> {
    let timedOut = false;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;

    const unsub = this.telemetry.onEvent((ev) => {
      if (ev.type === "death") {
        console.log("[eval] bot died — aborting episode.");
        void this.brain.abort();
      }
    });

    const handlePromise = this.brain.handle({
      sender: "harness",
      text: goal,
      whisper: true,
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      abortTimer = setTimeout(() => {
        timedOut = true;
        console.log(`[eval] episode timed out after ${timeoutMs / 1000}s — aborting.`);
        void this.brain.abort();
        resolve();
      }, timeoutMs);
    });

    try {
      await Promise.race([handlePromise, timeoutPromise]);
      // Ensure the (possibly aborted) turn fully settles before snapshotting.
      await handlePromise.catch(() => {});
    } finally {
      clearTimeout(abortTimer);
      unsub();
    }
    return timedOut;
  }

  private async returnToArena(): Promise<void> {
    try {
      await this.skillApi.goto(this.arena.x, this.arena.y, this.arena.z, 2);
    } catch (err) {
      console.warn(
        `[eval] could not return to arena (${this.arena.x}, ${this.arena.y}, ${this.arena.z}): ${(err as Error).message}`,
      );
    }
  }

  private snapshot(): WorldSnapshot {
    const b = this.bot;
    const p = b.entity.position;
    return {
      position: { x: round(p.x), y: round(p.y), z: round(p.z) },
      health: b.health,
      food: b.food,
      xpLevel: b.experience?.level ?? 0,
      timeOfDay: b.time.timeOfDay,
      day: b.time.day,
      inventory: this.skillApi.inventory(),
    };
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
