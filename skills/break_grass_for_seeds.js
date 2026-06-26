/** Break tall/short grass nearby to collect wheat seeds. */
export default async function (skills, args) {
  const radius = args.radius ?? 8;
  const bot = skills.bot;
  const Vec3 = (await import("vec3")).default;
  let seeds = 0;
  for (let i = 0; i < 40; i++) {
    const grass = bot.findBlock({
      point: bot.entity.position,
      matching: block => block && (block.name === "short_grass" || block.name === "tall_grass"),
      maxDistance: radius,
    });
    if (!grass) break;
    await bot.dig(grass);
    const invBefore = bot.inventory.items().filter(i => i.name === "wheat_seeds").length;
    await skills.wait(200);
    // re-check inventory after dig
  }
  const count = bot.inventory.items().filter(i => i.name === "wheat_seeds").reduce((s, i) => s + i.count, 0);
  skills.log(`Collected ${count} wheat seeds`);
  return count;
}