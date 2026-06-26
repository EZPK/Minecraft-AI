import type { Bot } from "./bot.js";
import { sleep } from "./util.js";

type Goal = Parameters<Bot["pathfinder"]["goto"]>[0];

export interface NavigateOptions {
  /** How many manual-unstuck retries before giving up. Default 3. */
  maxManualRetries?: number;
  /** Hard timeout per pathfinding attempt, in ms. Default 60000. */
  timeoutMs?: number;
  /** Progress callback (stuck/retry notices). */
  onLog?: (message: string) => void;
}

/**
 * Robust pathfinding: drive `bot.pathfinder.goto(goal)` with stuck-detection,
 * a hard timeout, and a manual-unstuck fallback (sprint+jump) that retries when
 * the pathfinder leaves the bot stationary. Shared by the SkillApi and the
 * navigation tools so there's a single robust implementation everywhere.
 */
export async function navigateTo(
  bot: Bot,
  goal: Goal,
  opts: NavigateOptions = {},
): Promise<void> {
  const maxManual = opts.maxManualRetries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  for (let attempt = 0; attempt <= maxManual; attempt++) {
    const result = await gotoOnce(bot, goal, timeoutMs);
    if (result === "arrived") return;
    if (attempt >= maxManual) {
      throw new Error(`Bot stuck after ${maxManual} manual unstuck attempts`);
    }
    opts.onLog?.(`Pathfinder stuck, manual unstuck attempt ${attempt + 1}/${maxManual}…`);
    await manualUnstuck(bot);
  }
}

// bot.pathfinder.stop() schedules a PathStopped rejection on gotoPromise via
// setTimeout(0) inside goto.js. Attaching .then(onOk, onErr) handles it so
// Node doesn't emit an unhandled rejection warning.
function gotoOnce(
  bot: Bot,
  goal: Goal,
  timeoutMs: number,
): Promise<"arrived" | "stuck"> {
  const POLL_MS = 2_000;
  const STUCK_LIMIT = 3; // 3 × 2s = 6s without movement
  const THRESHOLD = 0.5;

  return new Promise((resolve, reject) => {
    let intervalId: ReturnType<typeof setInterval>;
    let timerId: ReturnType<typeof setTimeout>;
    let done = false;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearInterval(intervalId);
      clearTimeout(timerId);
      fn();
    };

    const gotoPromise = bot.pathfinder.goto(goal);
    gotoPromise.then(
      () => finish(() => resolve("arrived")),
      (err: unknown) => finish(() => reject(err)),
    );

    let lastPos = bot.entity.position.clone();
    let stuckCount = 0;
    intervalId = setInterval(() => {
      const cur = bot.entity.position;
      if (cur.distanceTo(lastPos) < THRESHOLD) {
        if (++stuckCount >= STUCK_LIMIT) {
          finish(() => {
            bot.pathfinder.stop();
            resolve("stuck");
          });
        }
      } else {
        stuckCount = 0;
        lastPos = cur.clone();
      }
    }, POLL_MS);

    timerId = setTimeout(
      () =>
        finish(() => {
          bot.pathfinder.stop();
          reject(new Error(`goto timed out after ${timeoutMs / 1_000}s`));
        }),
      timeoutMs,
    );
  });
}

async function manualUnstuck(bot: Bot): Promise<void> {
  const controls = ["forward", "sprint", "jump"] as const;
  for (const c of controls) bot.setControlState(c, true);
  await sleep(1_200);
  for (const c of controls) bot.setControlState(c, false);
  await sleep(300);
}
