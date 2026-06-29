/** Harvest mature crops nearby (wheat, carrots, potatoes, beetroots) and optionally replant. */
export default async function (skills, args) {
  const radius = args.radius ?? 16;
  const replant = args.replant ?? true;
  const bot = skills.bot;

  // age at maturity for each crop block name
  const CROPS = {
    wheat: { matureAge: 7, seed: 'wheat_seeds' },
    carrots: { matureAge: 7, seed: 'carrot' },
    potatoes: { matureAge: 7, seed: 'potato' },
    beetroots: { matureAge: 3, seed: 'beetroot_seeds' },
  };

  let harvested = 0;
  let replanted = 0;

  for (const [cropName, { matureAge, seed }] of Object.entries(CROPS)) {
    // Snapshot positions of all mature crops of this type
    const positions = bot.findBlocks({
      point: bot.entity.position,
      matching: b => b && b.name === cropName && Number(b.getProperties()?.age ?? 0) >= matureAge,
      maxDistance: radius,
      count: 64,
    });

    for (const pos of positions) {
      const block = bot.blockAt(pos);
      // Re-check maturity (might have been harvested already)
      if (!block || block.name !== cropName || Number(block.getProperties()?.age ?? 0) < matureAge) continue;

      try {
        await skills.goto(pos.x + 0.5, pos.y, pos.z + 0.5, 2);
        await skills.dig(pos.x, pos.y, pos.z);
        harvested++;
        await skills.wait(250);

        if (replant && (skills.inventory()[seed] ?? 0) > 0) {
          try {
            await skills.place(seed, pos.x, pos.y, pos.z);
            replanted++;
          } catch {
            // No adjacent solid block or out of seeds — skip silently
          }
        }
      } catch (e) {
        skills.log(`Skip ${pos}: ${e.message}`);
      }
    }

    if (positions.length > 0) {
      skills.log(`${cropName}: harvested ${positions.length} patches`);
    }
  }

  skills.log(`Total: harvested ${harvested}, replanted ${replanted}`);
  return { harvested, replanted };
}
