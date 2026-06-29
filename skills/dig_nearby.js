/** Dig the nearest blocks of a given type within reach without pathfinding — fallback when pathfinder fails. */
export default async function (skills, args) {
  const blockType = args.block;
  const count = args.count ?? 1;
  const radius = args.radius ?? 10;
  const bot = skills.bot;

  const blocks = bot.findBlocks({
    matching: (b) => b.name === blockType,
    maxDistance: radius,
    count: count * 3,
  });

  if (!blocks || blocks.length === 0) {
    skills.log(`No ${blockType} found nearby`);
    return 0;
  }

  let dug = 0;
  for (const pos of blocks) {
    if (dug >= count) break;

    const dx = pos.x - bot.entity.position.x;
    const dy = pos.y - bot.entity.position.y;
    const dz = pos.z - bot.entity.position.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 5) continue;

    await skills.lookAt(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
    await skills.wait(100);

    try {
      const dug_ok = await skills.dig(pos.x, pos.y, pos.z);
      if (dug_ok) {
        dug++;
        skills.log(`Dug ${blockType} at ${pos}`);
        await skills.wait(300);
      }
    } catch (e) {
      skills.log(`Failed to dig: ${e.message}`);
    }
  }

  skills.log(`Dug ${dug}/${count} ${blockType}`);
  return dug;
}
