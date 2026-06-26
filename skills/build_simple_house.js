/** Build a compact 5x4 wooden house at current position, no flattening needed */
export default async function (skills, args) {
  const bot = skills.bot;
  const Vec3 = (await import('vec3')).default;
  const v = (x,y,z) => Vec3(x,y,z);

  const pos = bot.entity.position;
  const cx = Math.floor(pos.x);
  const cz = Math.floor(pos.z);
  const groundY = Math.floor(pos.y) - 1;

  const hx1 = cx - 2;
  const hx2 = cx + 2;
  const hz1 = cz - 1;
  const hz2 = cz + 2;
  const floorY = groundY + 1;

  skills.log(`Building 5x4 house at (${hx1},${hz1})->(${hx2},${hz2}), floor y=${floorY}`);

  // Helper to place a block if the spot is empty
  const placeBlock = async (x, y, z, itemName) => {
    const target = v(x, y, z);
    const existing = bot.blockAt(target);
    if (existing && existing.name !== 'air') return true;

    const inv = bot.inventory.items();
    const item = inv.find(i => i.name === itemName);
    if (!item) {
      // fallback to dirt
      const dirt = inv.find(i => i.name === 'dirt');
      if (!dirt) return false;
      await bot.equip(dirt, 'hand');
    } else {
      await bot.equip(item, 'hand');
    }

    // Try placing on block below
    const below = bot.blockAt(v(x, y-1, z));
    if (below && below.name !== 'air') {
      try { await bot.placeBlock(below, v(0,1,0)); await skills.wait(80); return true; } catch(e) {}
    }
    // Try horizontal adjacency
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const adj = bot.blockAt(v(x+dx, y, z+dz));
      if (adj && adj.name !== 'air') {
        try { await bot.placeBlock(adj, v(-dx,0,-dz)); await skills.wait(80); return true; } catch(e) {}
      }
    }
    return false;
  };

  // 1. Floor (5x4)
  skills.log('Floor...');
  for (let bx = hx1; bx <= hx2; bx++) {
    for (let bz = hz1; bz <= hz2; bz++) {
      await placeBlock(bx, floorY, bz, 'oak_planks');
    }
  }

  // 2. Walls (3 high, skip door at front center)
  skills.log('Walls...');
  for (let layer = 1; layer <= 3; layer++) {
    const wy = floorY + layer;
    for (let bx = hx1; bx <= hx2; bx++) {
      for (let bz = hz1; bz <= hz2; bz++) {
        // Only perimeter blocks
        if (bx > hx1 && bx < hx2 && bz > hz1 && bz < hz2) continue;
        // Door: front face is z=hz1, center is at cx
        if (bz === hz1 && bx === cx && layer <= 2) continue;
        await placeBlock(bx, wy, bz, 'oak_planks');
      }
    }
  }

  // 3. Roof
  skills.log('Roof...');
  for (let bx = hx1; bx <= hx2; bx++) {
    for (let bz = hz1; bz <= hz2; bz++) {
      await placeBlock(bx, floorY + 4, bz, 'oak_planks');
    }
  }

  // 4. Door
  skills.log('Door...');
  const doorItem = bot.inventory.items().find(i => i.name === 'oak_door');
  if (doorItem) {
    await bot.equip(doorItem, 'hand');
    try {
      await bot.placeBlock(bot.blockAt(v(cx, floorY, hz1 - 1)), v(0,0,1));
      skills.log('Door placed!');
    } catch(e) {
      skills.log(`Door error: ${e.message}`);
    }
  }

  skills.say('Maison construite ! 🏠');
  return { done: true };
}