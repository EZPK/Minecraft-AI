/** Place a crafting table from inventory on the ground below the bot */
export default async function (skills, args) {
  const bot = skills.bot;
  const pos = bot.entity.position;
  const ground = bot.blockAt(pos.offset(0, -1, 0));
  const item = bot.inventory.items().find(i => i.name === 'crafting_table');
  if (!item) return skills.log('No crafting table in inventory');
  
  await bot.equip(item, 'hand');
  try {
    await bot.placeBlock(ground, [0, 1, 0]);
    skills.log('Crafting table placed!');
    return true;
  } catch (e) {
    skills.log(`Failed: ${e.message}`);
    return false;
  }
}