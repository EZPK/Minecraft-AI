/** Mine nearby iron ore (regular and deepslate). Auto-equips the best pickaxe. */
export default async function (skills, args) {
  const count = args.count ?? 8;
  const radius = args.radius ?? 32;

  const pick = skills.bot.inventory.items()
    .filter(i => i.name.includes('pickaxe'))
    .sort((a, b) => {
      const tier = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden'];
      return tier.findIndex(t => a.name.startsWith(t)) - tier.findIndex(t => b.name.startsWith(t));
    })[0];
  if (pick) await skills.bot.equip(pick, 'hand');
  else skills.log('Warning: no pickaxe in inventory — mining will be slow');

  let mined = 0;
  for (const ore of ['iron_ore', 'deepslate_iron_ore']) {
    if (mined >= count) break;
    const got = await skills.collectBlock(ore, count - mined, radius);
    mined += got;
    if (got > 0) skills.log(`Collected ${got} ${ore}`);
  }

  skills.log(`Mined ${mined}/${count} iron ore`);
  return { mined, requested: count };
}
