/** Place a door from inventory at the bot's current position */
export default async function (skills, args) {
  const bot = skills.bot;
  const Vec3 = (await import('vec3')).default;
  const v = (x, y, z) => Vec3(x, y, z);

  const pos = bot.entity.position;
  const cx = Math.floor(pos.x);
  const cy = Math.floor(pos.y);
  const cz = Math.floor(pos.z);

  const door = bot.inventory.items().find(i => i.name.endsWith('_door'));
  if (!door) {
    skills.log('No door found in inventory');
    return false;
  }

  await skills.equip(door.name);

  const targetBlock = bot.blockAt(v(cx, cy - 1, cz));
  if (targetBlock && targetBlock.name !== 'air') {
    try {
      await bot.placeBlock(targetBlock, v(0, 1, 0));
      skills.log('Door placed!');
      return true;
    } catch (e) {
      skills.log(`Failed at feet: ${e.message}`);
    }
  }

  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const adj = bot.blockAt(v(cx + dx, cy, cz + dz));
    if (adj && adj.name !== 'air') {
      try {
        await bot.placeBlock(adj, v(-dx, 0, -dz));
        skills.log('Door placed (adjacent)!');
        return true;
      } catch (e) { }
    }
  }

  return false;
}
