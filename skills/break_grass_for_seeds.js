/** Break tall/short grass nearby to collect wheat seeds. */
export default async function (skills, args) {
  const radius = args.radius ?? 8;
  const target = args.count ?? 10;
  const bot = skills.bot;

  let broken = 0;
  for (let attempt = 0; attempt < 60 && broken < target; attempt++) {
    const grass = bot.findBlock({
      point: bot.entity.position,
      matching: b => b && (b.name === 'short_grass' || b.name === 'tall_grass'),
      maxDistance: radius,
    });
    if (!grass) break;

    try {
      const dist = grass.position.distanceTo(bot.entity.position);
      if (dist > 4) await skills.goto(grass.position.x, grass.position.y, grass.position.z, 2);
      const ok = await skills.dig(grass.position.x, grass.position.y, grass.position.z);
      if (ok) broken++;
      await skills.wait(150);
    } catch (e) {
      skills.log(`Skip grass: ${e.message}`);
    }
  }

  const seeds = skills.inventory()['wheat_seeds'] ?? 0;
  skills.log(`Broke ${broken} grass patches, now have ${seeds} wheat seeds`);
  return { broken, seeds };
}
