/** Hunt nearby passive animals for food. Waits for drops and lets Minecraft auto-pickup. */
export default async function (skills, args) {
  const count = args.count ?? 3;
  const ALL_ANIMALS = ['cow', 'pig', 'sheep', 'chicken', 'rabbit'];
  const targets = args.animals
    ? Array.isArray(args.animals) ? args.animals : [args.animals]
    : ALL_ANIMALS;
  const bot = skills.bot;

  let killed = 0;
  const MAX_ATTEMPTS = count * 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && killed < count; attempt++) {
    // Find the nearest target animal still alive
    const entity = Object.values(bot.entities)
      .filter(e => e !== bot.entity && targets.includes(e.name ?? '') && e.isValid)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];

    if (!entity) {
      skills.log('No animals in range');
      break;
    }

    const dist = entity.position.distanceTo(bot.entity.position);
    skills.log(`Found ${entity.name} at ${dist.toFixed(1)} blocks`);

    // Approach
    if (dist > 3) {
      const { x, y, z } = entity.position;
      try {
        await skills.goto(x, y, z, 2);
      } catch (e) {
        skills.log(`Can't reach ${entity.name}: ${e.message}`);
        continue;
      }
    }

    // Attack until dead (max 15 hits to avoid infinite loop if something's wrong)
    await bot.lookAt(entity.position.offset(0, entity.height * 0.5, 0));
    for (let hit = 0; hit < 15 && entity.isValid; hit++) {
      bot.attack(entity);
      await skills.wait(600);
    }

    if (!entity.isValid) {
      killed++;
      skills.log(`Killed ${entity.name} (${killed}/${count})`);
      // Stay near death site — Minecraft auto-pickup handles item collection
      await skills.wait(1200);
    }
  }

  // Report food now in inventory
  const FOOD_KEYWORDS = ['beef', 'pork', 'chicken', 'mutton', 'rabbit', 'meat', 'fish'];
  const food = Object.fromEntries(
    Object.entries(skills.inventory()).filter(([k]) =>
      FOOD_KEYWORDS.some(kw => k.includes(kw)),
    ),
  );

  skills.log(`Killed ${killed}. Food in inventory: ${JSON.stringify(food)}`);
  return { killed, food };
}
