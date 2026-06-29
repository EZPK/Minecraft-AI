/** Place a crafting table on the ground at the bot's feet. */
import { Vec3 } from "vec3";
export default async function (skills, args) {
  const bot = skills.bot;
  const item = bot.inventory.items().find(i => i.name === "crafting_table");
  if (!item) throw new Error("No crafting table in inventory");
  await bot.equip(item, "hand");

  // Stop pathfinder and let physics settle to avoid invalid_player_movement kicks.
  bot.pathfinder.stop();
  await bot.waitForTicks(5);

  const pos = bot.entity.position.floored();
  const below = bot.blockAt(new Vec3(pos.x, pos.y - 1, pos.z));
  skills.log(`Standing on: ${below.name} at ${below.position}`);

  await bot.placeBlock(below, new Vec3(0, 1, 0));
  skills.log("Crafting table placed!");
  return { placed: true, at: { x: pos.x, y: pos.y, z: pos.z } };
}
