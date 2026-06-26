/** Place an oak door in front of the bot */
export default async function (skills, args) {
  const bot = skills.bot;
  const Vec3 = (await import('vec3')).default;
  const v = (x,y,z) => Vec3(x,y,z);

  const pos = bot.entity.position;
  const cx = Math.floor(pos.x);
  const cy = Math.floor(pos.y);
  const cz = Math.floor(pos.z);

  // Find the door in inventory
  const door = bot.inventory.items().find(i => i.name === 'oak_door');
  if (!door) {
    skills.log('No door found');
    return false;
  }

  await bot.equip(door, 'hand');

  // Look at where we want to place it - the block below the door
  const targetBlock = bot.blockAt(v(cx, cy - 1, cz));
  if (targetBlock && targetBlock.name !== 'air') {
    try {
      await bot.placeBlock(targetBlock, v(0, 1, 0));
      skills.log('Door placed!');
      return true;
    } catch(e) {
      skills.log(`Failed: ${e.message}`);
    }
  }

  // Try adjacent
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const adj = bot.blockAt(v(cx+dx, cy, cz+dz));
    if (adj && adj.name !== 'air') {
      try {
        await bot.placeBlock(adj, v(-dx,0,-dz));
        skills.log('Door placed (adjacent)!');
        return true;
      } catch(e) {}
    }
  }

  return false;
}