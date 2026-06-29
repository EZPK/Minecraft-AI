import mineflayer, { type Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import collectBlockPkg from "mineflayer-collectblock";
import type { MinecraftConfig } from "./config.js";

const { pathfinder, Movements } = pathfinderPkg;
// mineflayer-collectblock's default export is the plugin function.
const collectBlock =
  (collectBlockPkg as unknown as { plugin?: typeof import("mineflayer-collectblock").plugin })
    .plugin ?? (collectBlockPkg as unknown as typeof import("mineflayer-collectblock").plugin);

export type { Bot };

export function createBot(cfg: MinecraftConfig): Promise<Bot> {
  const bot = mineflayer.createBot({
    host: cfg.host,
    port: cfg.port,
    version: cfg.version,
    username: cfg.username,
    auth: cfg.auth,
    // 1.21.5+ introduced a per-message checksum in the signed-chat protocol that
    // minecraft-protocol doesn't compute correctly for all server configurations,
    // causing chat_validation_failed kicks. Disable via MC_DISABLE_CHAT_SIGNING=true
    // if you see this error. Default: false (signed chat, messages appear normally).
    disableChatSigning: process.env.MC_DISABLE_CHAT_SIGNING === "true",
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(connectTimer);
      bot.removeListener("error", onError);
      bot.removeListener("kicked", onKicked);
      bot.removeListener("end", onEnd);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Ensure the half-open connection is torn down so it can't leak.
      try {
        bot.end();
      } catch {
        /* already closed */
      }
      reject(err);
    };

    // If neither spawn nor a terminal event arrives (e.g. auth stalls), don't
    // hang the reconnect loop forever — bail out and let it retry.
    const connectTimer = setTimeout(
      () => fail(new Error("connection timed out after 30s (no spawn)")),
      30_000,
    );

    const onError = (err: Error) => fail(err);
    const onKicked = (reason: string) =>
      fail(new Error(`kicked before spawn: ${reason}`));
    const onEnd = (reason: string) =>
      fail(new Error(`disconnected before spawn: ${reason}`));

    bot.once("error", onError);
    bot.once("kicked", onKicked);
    bot.once("end", onEnd);

    bot.once("spawn", () => {
      if (settled) return;
      settled = true;
      cleanup();

      // Default movement profile for pathfinder.
      const movements = new Movements(bot);
      movements.allowParkour = true;
      movements.canDig = true;
      movements.allow1by1towers = true;
      movements.canOpenDoors = true;
      bot.pathfinder.setMovements(movements);

      resolve(bot);
    });
  });
}
