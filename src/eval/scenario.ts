import type { Bot } from "../bot.js";

/** A point-in-time snapshot of the world state the fitness function scores on. */
export interface WorldSnapshot {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  xpLevel: number;
  timeOfDay: number;
  day: number;
  /** item name → total count across the inventory. */
  inventory: Record<string, number>;
}

/** Per-episode behavioural telemetry, gathered from the session + bot events. */
export interface EpisodeTelemetry {
  toolCalls: number;
  toolErrors: number;
  retries: number;
  deaths: number;
  pathFailures: number;
  timedOut: boolean;
  durationMs: number;
}

/** A fitness score plus a labelled breakdown, so results are explainable. */
export interface FitnessBreakdown {
  score: number;
  components: Record<string, number>;
}

/**
 * One evaluation scenario: a goal given to the agent, a timeout, an optional
 * precondition gate, and a fitness function scoring the before/after world.
 *
 * Scoring runs on a live, non-reproducible server, so fitness functions should
 * prefer per-episode *deltas* (e.g. distinct new item types acquired) and
 * competence signals (tool-error rate, deaths) over absolute or
 * location-dependent quantities. See `src/eval/fitness.ts` for shared helpers.
 */
export interface Scenario {
  id: string;
  goalPrompt: string;
  timeoutMs: number;
  /**
   * Checked near the arena before the episode runs. Return a reason string when
   * preconditions are NOT met — the scenario is then *neutralized* (skipped,
   * scored 0, excluded from comparison) rather than counted as a failure, so the
   * agent is never penalised for the world's luck.
   */
  precondition?: (bot: Bot, before: WorldSnapshot) => string | null;
  fitness: (
    before: WorldSnapshot,
    after: WorldSnapshot,
    telemetry: EpisodeTelemetry,
  ) => FitnessBreakdown;
}

/** The full result of running one scenario once. */
export interface ScenarioRun {
  scenarioId: string;
  before: WorldSnapshot;
  after: WorldSnapshot;
  telemetry: EpisodeTelemetry;
  fitness: FitnessBreakdown;
  /** Non-null when the precondition gate skipped this run; carries the reason. */
  skipped: string | null;
}
