import { loadConfig } from "../config.js";
import { EvalHarness, type Arena } from "./harness.js";
import { SCENARIOS, getScenario } from "./scenarios.js";
import type { ScenarioRun } from "./scenario.js";

/** Aggregate score stats across trials of one scenario. */
export interface ScenarioSummary {
  scenarioId: string;
  trials: number;
  skipped: number;
  mean: number;
  stdDev: number;
  scores: number[];
  /** Averaged behavioural telemetry over scored trials — diagnostic signal for reflection. */
  avgToolErrors: number;
  avgDeaths: number;
  timeouts: number;
  /** Fitness component breakdown from the last scored trial, for explainability. */
  sampleComponents: Record<string, number>;
  /**
   * Non-zero inventory changes from the last scored trial.
   * Positive = gained, negative = consumed. Lets the reflect agent see exactly
   * what was (or was not) accomplished regardless of what the bot claimed.
   */
  sampleInventoryDelta: Record<string, number>;
}

function readArena(): Arena {
  const x = process.env.EVAL_ARENA_X;
  const y = process.env.EVAL_ARENA_Y;
  const z = process.env.EVAL_ARENA_Z;
  if (!x || !y || !z) {
    throw new Error(
      "Set EVAL_ARENA_X/Y/Z (the fixed coordinate the bot returns to between episodes) in .env.eval",
    );
  }
  return { x: Number(x), y: Number(y), z: Number(z) };
}

function printRun(run: ScenarioRun, trial: number): void {
  if (run.skipped) {
    console.log(`  trial ${trial + 1}: SKIPPED (${run.skipped})`);
    return;
  }
  const parts = Object.entries(run.fitness.components)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(
    `  trial ${trial + 1}: score=${run.fitness.score}  [${parts}]  ` +
      `(${run.telemetry.toolCalls} tools, ${run.telemetry.toolErrors} err, ` +
      `${run.telemetry.deaths} deaths, ${Math.round(run.telemetry.durationMs / 1000)}s` +
      `${run.telemetry.timedOut ? ", TIMEOUT" : ""})`,
  );
}

function summarize(scenarioId: string, runs: ScenarioRun[]): ScenarioSummary {
  const scored = runs.filter((r) => r.skipped === null);
  const scores = scored.map((r) => r.fitness.score);
  const mean = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  const variance = scores.length
    ? scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
    : 0;
  const avg = (sel: (r: ScenarioRun) => number) =>
    scored.length ? round2(scored.reduce((a, r) => a + sel(r), 0) / scored.length) : 0;
  return {
    scenarioId,
    trials: runs.length,
    skipped: runs.length - scores.length,
    mean: round2(mean),
    stdDev: round2(Math.sqrt(variance)),
    scores,
    avgToolErrors: avg((r) => r.telemetry.toolErrors),
    avgDeaths: avg((r) => r.telemetry.deaths),
    timeouts: scored.filter((r) => r.telemetry.timedOut).length,
    sampleComponents: scored.at(-1)?.fitness.components ?? {},
    sampleInventoryDelta: inventoryDelta(scored.at(-1)),
  };
}

function inventoryDelta(run: ScenarioRun | undefined): Record<string, number> {
  if (!run) return {};
  const delta: Record<string, number> = {};
  const allKeys = new Set([
    ...Object.keys(run.before.inventory),
    ...Object.keys(run.after.inventory),
  ]);
  for (const k of allKeys) {
    const d = (run.after.inventory[k] ?? 0) - (run.before.inventory[k] ?? 0);
    if (d !== 0) delta[k] = d;
  }
  return delta;
}

export interface RunEvalOptions {
  /**
   * Working directory the bot runs from — its `skills/` library and `AGENTS.md`
   * are read from here. The evolution loop points this at a git worktree to
   * evaluate an evolved candidate; defaults to the current process cwd.
   */
  cwd?: string;
}

/**
 * Run one or more scenarios N times each against the live server and print a
 * scored summary with variance. With no ids, runs the whole suite.
 *
 * Returns the per-scenario summaries (also used by the evolution loop).
 */
export async function runEval(
  ids: string[],
  opts: RunEvalOptions = {},
): Promise<ScenarioSummary[]> {
  const config = loadConfig();
  const arena = readArena();
  const trials = Math.max(1, Number(process.env.EVAL_TRIALS ?? "1"));
  const targets = ids.length ? ids : SCENARIOS.map((s) => s.id);

  const harness = new EvalHarness(config, arena, opts.cwd ?? process.cwd());
  await harness.boot();

  const summaries: ScenarioSummary[] = [];
  try {
    for (const id of targets) {
      const scenario = getScenario(id);
      if (!scenario) {
        console.error(`[eval] unknown scenario "${id}" — skipping`);
        continue;
      }
      console.log(`\n[eval] === ${id} (${trials} trial${trials > 1 ? "s" : ""}) ===`);
      const runs: ScenarioRun[] = [];
      for (let t = 0; t < trials; t++) {
        const run = await harness.runScenario(scenario);
        printRun(run, t);
        runs.push(run);
      }
      const summary = summarize(id, runs);
      summaries.push(summary);
      console.log(
        `[eval] ${id}: mean=${summary.mean} ± ${summary.stdDev} ` +
          `over ${summary.scores.length} scored / ${summary.trials} trials` +
          `${summary.skipped ? ` (${summary.skipped} skipped)` : ""}`,
      );
    }
  } finally {
    await harness.shutdown();
  }

  return summaries;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
