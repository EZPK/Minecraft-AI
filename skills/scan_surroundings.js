/** Survey the area and return a structured snapshot: position, health, inventory, nearby entities and blocks of interest. */
export default async function (skills, args) {
  const radius = args.radius ?? 32;
  const bot = skills.bot;
  const pos = bot.entity.position;

  // Status
  const status = {
    position: { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) },
    health: bot.health,
    food: bot.food,
    saturation: bot.foodSaturation,
    experience: bot.experience?.level ?? 0,
  };

  // Nearby entities (players, mobs, animals)
  const entities = Object.values(bot.entities)
    .filter(e => e !== bot.entity && e.position.distanceTo(pos) <= radius)
    .map(e => ({
      name: e.name ?? e.type,
      kind: e.type,
      distance: Math.round(e.position.distanceTo(pos)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24);

  // Blocks of interest — scan a curated list so we don't spam findBlocks for everything
  const INTERESTING = [
    'diamond_ore', 'deep_slate_diamond_ore',
    'iron_ore', 'deepslate_iron_ore',
    'gold_ore', 'deepslate_gold_ore',
    'coal_ore', 'deepslate_coal_ore',
    'copper_ore',
    'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
    'chest', 'barrel', 'crafting_table', 'furnace', 'blast_furnace',
    'water', 'lava',
    'wheat', 'carrots', 'potatoes', 'beetroots',
  ];

  const nearbyBlocks = {};
  for (const name of INTERESTING) {
    const found = skills.findBlocks(name, 5, radius);
    if (found.length > 0) nearbyBlocks[name] = found.length;
  }

  const inventory = skills.inventory();

  const report = { status, entities, nearby_blocks: nearbyBlocks, inventory };
  skills.log(JSON.stringify(report, null, 2));
  return report;
}
