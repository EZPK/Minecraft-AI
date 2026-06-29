import type { Bot } from "./bot.js";

/** A structured failure/abort-relevant event observed on the bot. */
export interface TelemetryEvent {
  type: "death" | "respawn" | "kicked" | "end" | "low_health" | "path_failed";
  /** Date.now() when observed. */
  at: number;
  /** Optional human-readable detail (kick reason, path status, health value…). */
  detail?: string;
}

/** Running tallies derived from the event stream — handy as fitness penalties. */
export interface TelemetryCounters {
  deaths: number;
  pathFailures: number;
  lowHealthEvents: number;
}

const LOW_HEALTH_THRESHOLD = 6;

/**
 * Subscribes to a bot's failure/abort-relevant events and records them as a
 * structured stream plus running counters. None of these (death, pathfinding
 * give-up, low health) were listened to before, so the agent and the eval
 * harness had no machine-readable signal that something went wrong.
 *
 * Used two ways:
 * - in the live runtime for `[telemetry]` console visibility;
 * - in the eval harness as abort signals (death) and fitness penalties
 *   (deaths, path failures), with `reset()` between episodes.
 */
export class BotTelemetry {
  readonly events: TelemetryEvent[] = [];
  readonly counters: TelemetryCounters = {
    deaths: 0,
    pathFailures: 0,
    lowHealthEvents: 0,
  };

  private readonly listeners = new Set<(e: TelemetryEvent) => void>();
  private detach: (() => void) | undefined;
  private inDanger = false;

  /**
   * @param bot the mineflayer bot to observe
   * @param log whether to echo each event to the console (default true)
   */
  constructor(
    private readonly bot: Bot,
    private readonly log = true,
  ) {}

  /** Attach listeners. Idempotent-safe: call once after spawn. */
  start(): void {
    if (this.detach) return;
    const bot = this.bot;

    const onDeath = () => this.push({ type: "death", at: Date.now() });
    const onRespawn = () => this.push({ type: "respawn", at: Date.now() });
    const onKicked = (reason: unknown) =>
      this.push({ type: "kicked", at: Date.now(), detail: stringify(reason) });
    const onEnd = (reason: unknown) =>
      this.push({ type: "end", at: Date.now(), detail: stringify(reason) });
    const onHealth = () => {
      // Edge-trigger: emit once on entering the danger zone, reset on recovery,
      // so a sustained low-health stretch doesn't spam the stream.
      const low = bot.health > 0 && bot.health <= LOW_HEALTH_THRESHOLD;
      if (low && !this.inDanger) {
        this.push({ type: "low_health", at: Date.now(), detail: `health=${bot.health}` });
      }
      this.inDanger = low;
    };
    const onPathUpdate = (r: { status?: string }) => {
      if (r?.status === "noPath" || r?.status === "timeout") {
        this.push({ type: "path_failed", at: Date.now(), detail: r.status });
      }
    };

    bot.on("death", onDeath);
    bot.on("respawn", onRespawn);
    bot.on("kicked", onKicked);
    bot.on("end", onEnd);
    bot.on("health", onHealth);
    // pathfinder emits `path_update` on the bot itself.
    bot.on("path_update" as never, onPathUpdate as never);

    this.detach = () => {
      bot.off("death", onDeath);
      bot.off("respawn", onRespawn);
      bot.off("kicked", onKicked);
      bot.off("end", onEnd);
      bot.off("health", onHealth);
      bot.off("path_update" as never, onPathUpdate as never);
    };
  }

  /** Subscribe to events as they arrive (e.g. harness aborting on death). Returns an unsubscribe. */
  onEvent(fn: (e: TelemetryEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Clear the event log and counters — call at the start of each eval episode. */
  reset(): void {
    this.events.length = 0;
    this.counters.deaths = 0;
    this.counters.pathFailures = 0;
    this.counters.lowHealthEvents = 0;
    this.inDanger = false;
  }

  /** Detach all bot listeners. */
  stop(): void {
    this.detach?.();
    this.detach = undefined;
    this.listeners.clear();
  }

  private push(e: TelemetryEvent): void {
    this.events.push(e);
    if (e.type === "death") this.counters.deaths++;
    else if (e.type === "path_failed") this.counters.pathFailures++;
    else if (e.type === "low_health") this.counters.lowHealthEvents++;
    if (this.log) {
      console.log(`[telemetry] ${e.type}${e.detail ? ` (${e.detail})` : ""}`);
    }
    for (const fn of this.listeners) fn(e);
  }
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
