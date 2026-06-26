/** Dig a 1×1 vertical shaft straight down to target_y (or `depth` blocks below current position). Stops on lava. */
export default async function (skills, args) {
  const bot = skills.bot;
  const startY = Math.floor(bot.entity.position.y);
  const targetY = args.target_y ?? startY - (args.depth ?? 16);

  if (startY <= targetY + 1) {
    skills.log(`Already at Y=${startY} (target Y=${targetY}), nothing to dig`);
    return { dug: 0, start_y: startY, end_y: startY };
  }

  skills.log(`Digging from Y=${startY} down to Y=${targetY}…`);
  let dug = 0;
  const LAVA = new Set(['lava', 'flowing_lava']);
  const AIR = new Set(['air', 'cave_air', 'void_air']);

  while (Math.floor(bot.entity.position.y) > targetY + 1) {
    const cur = bot.entity.position.floored();
    const below = bot.blockAt(cur.offset(0, -1, 0));

    if (!below || AIR.has(below.name)) {
      // Already in a gap, wait for physics to catch up
      await skills.wait(250);
      continue;
    }
    if (LAVA.has(below.name)) {
      skills.log(`Lava at Y=${cur.y - 1} — stopping`);
      break;
    }
    if (!bot.canDigBlock(below)) {
      skills.log(`Cannot dig ${below.name} at Y=${cur.y - 1} — stopping`);
      break;
    }

    await bot.dig(below);
    dug++;
    // Small pause for physics (bot falls one block after the dig)
    await skills.wait(200);
  }

  const endY = Math.floor(bot.entity.position.y);
  skills.log(`Reached Y=${endY}, dug ${dug} blocks`);
  return { dug, start_y: startY, end_y: endY };
}
