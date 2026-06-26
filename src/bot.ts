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
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      bot.removeListener("error", onError);
      reject(err);
    };
    bot.once("error", onError);

    bot.once("spawn", () => {
      bot.removeListener("error", onError);

      // Default movement profile for pathfinder.
      const mcData = bot.registry;
      const movements = new Movements(bot);
      movements.allowParkour = true;
      movements.canDig = true;
      bot.pathfinder.setMovements(movements);
      void mcData;

      resolve(bot);
    });
  });
}
