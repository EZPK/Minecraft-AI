/** Survey the area and return a structured snapshot: position, health, inventory, nearby entities and blocks of interest. */
export default async function (skills, args) {
  const radius = args.radius ?? 32;

  const vitals = skills.status();
  const status = {
    position: { x: Math.round(vitals.position.x), y: Math.round(vitals.position.y), z: Math.round(vitals.position.z) },
    health: vitals.health,
    food: vitals.food,
    saturation: vitals.saturation,
    experience: vitals.experience,
  };

  const entities = skills.findEntities(undefined, radius)
    .map(e => ({
      name: e.name ?? e.type,
      kind: e.type,
      distance: Math.round(e.position.distanceTo(skills.bot.entity.position)),
    }))
    .slice(0, 24);

  const INTERESTING = [
    'diamond_ore', 'deepslate_diamond_ore',
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
