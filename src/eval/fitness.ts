import type {
  EpisodeTelemetry,
  FitnessBreakdown,
  WorldSnapshot,
} from "./scenario.js";

/** All log block/item names, so "any wood" goals are version-agnostic. */
export const WOOD_LOGS = [
  "oak_log",
  "birch_log",
  "spruce_log",
  "jungle_log",
  "acacia_log",
  "dark_oak_log",
  "mangrove_log",
  "cherry_log",
] as const;

export function itemCount(snap: WorldSnapshot, item: string): number {
  return snap.inventory[item] ?? 0;
}

/** Net gain in a single item between snapshots (may be negative). */
export function gain(before: WorldSnapshot, after: WorldSnapshot, item: string): number {
  return itemCount(after, item) - itemCount(before, item);
}

/** Net positive gain summed over a set of item names (e.g. all log types). */
export function gainAny(
  before: WorldSnapshot,
  after: WorldSnapshot,
  items: readonly string[],
): number {
  return items.reduce((n, it) => n + Math.max(0, gain(before, after, it)), 0);
}

/** Does the inventory hold any of these items? */
export function hasAny(snap: WorldSnapshot, items: readonly string[]): boolean {
  return items.some((it) => itemCount(snap, it) > 0);
}

/**
 * How many item *types* appear in `after` that were absent in `before`. This is
 * the tech-tree progress signal (à la Voyager) and the least noisy reward on a
 * live, unresettable world.
 */
export function distinctNewTypes(before: WorldSnapshot, after: WorldSnapshot): number {
  let n = 0;
  for (const name of Object.keys(after.inventory)) {
    if (itemCount(before, name) === 0 && itemCount(after, name) > 0) n++;
  }
  return n;
}

/**
 * Standard competence penalty from behavioural telemetry — the same for every
 * scenario, so "played badly" is punished consistently regardless of the goal.
 */
export function penalties(tel: EpisodeTelemetry): {
  total: number;
  components: Record<string, number>;
} {
  const errorRate = tel.toolCalls > 0 ? tel.toolErrors / tel.toolCalls : 0;
  const components = {
    deaths: tel.deaths * 5,
    timeout: tel.timedOut ? 2 : 0,
    toolErrors: round2(errorRate * 3),
    pathFailures: round2(tel.pathFailures * 0.5),
  };
  const total = round2(Object.values(components).reduce((a, b) => a + b, 0));
  return { total, components };
}

/**
 * Compose a FitnessBreakdown from positive reward components minus the standard
 * competence penalties. The breakdown keeps every component (penalties shown
 * negative) so a score is always explainable.
 */
export function compose(
  reward: Record<string, number>,
  tel: EpisodeTelemetry,
): FitnessBreakdown {
  const pen = penalties(tel);
  const rewardTotal = Object.values(reward).reduce((a, b) => a + b, 0);
  const components: Record<string, number> = {};
  for (const [k, v] of Object.entries(reward)) components[k] = round2(v);
  for (const [k, v] of Object.entries(pen.components)) {
    if (v !== 0) components[`penalty_${k}`] = -v;
  }
  return { score: round2(rewardTotal - pen.total), components };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
