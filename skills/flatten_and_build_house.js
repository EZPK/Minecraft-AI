/** Flatten a 9x9 area at ground level, then build a small house wall by wall. */
export default async function (skills, args) {
  const bot = skills.bot;
  const Vec3 = (await import('vec3')).default;
  const v = (x,y,z) => Vec3(x,y,z);

  const pos = bot.entity.position;
  const cx = Math.floor(pos.x);
  const cz = Math.floor(pos.z);
  const cy = Math.floor(pos.y);

  // Find ground level
  const groundY = cy - 1;
  skills.log(`Ground level: y=${groundY}`);

  // === PHASE 1: flatten a 9x9 ===
  skills.log('Flattening area...');
  let cleared = 0;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let y = groundY + 1; y <= groundY + 4; y++) {
        const block = bot.blockAt(v(cx+dx, y, cz+dz));
        if (block && block.name !== 'air' && block.name !== 'bedrock') {
          try {
            await bot.dig(block);
            await skills.wait(150);
            cleared++;
          } catch (e) {}
        }
      }
    }
  }
  skills.log(`Cleared ${cleared} blocks above ground`);

  // Fill holes
  let filled = 0;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const block = bot.blockAt(v(cx+dx, groundY, cz+dz));
      if (!block || block.name === 'air') {
        for (let fy = groundY; fy >= groundY - 5; fy--) {
          const fb = bot.blockAt(v(cx+dx, fy, cz+dz));
          if (!fb || fb.name === 'air') {
            const refBelow = bot.blockAt(v(cx+dx, fy-1, cz+dz));
            if (refBelow && refBelow.name !== 'air') {
              const dirt = bot.inventory.items().find(i => i.name === 'dirt');
              if (dirt) {
                try {
                  await bot.equip(dirt, 'hand');
                  await bot.placeBlock(refBelow, v(0,1,0));
                  await skills.wait(100);
                  filled++;
                } catch(e) {}
              }
            }
          } else break;
        }
      }
    }
  }
  skills.log(`Filled ${filled} holes`);

  // === PHASE 2: BUILD HOUSE ===
  const hx1 = cx - 3;
  const hx2 = cx + 3;
  const hz1 = cz - 2;
  const hz2 = cz + 2;
  const floorY = groundY + 1;

  skills.log(`House: (${hx1},${hz1}) to (${hx2},${hz2}) at y=${floorY}`);

  const placeIfEmpty = async (x, y, z, itemName) => {
    const target = v(x, y, z);
    const existing = bot.blockAt(target);
    if (existing && existing.name !== 'air') return true;

    const inv = bot.inventory.items();
    const item = inv.find(i => i.name === itemName);
    if (!item) return false;

    await bot.equip(item, 'hand');
    const below = bot.blockAt(v(x, y-1, z));
    if (below && below.name !== 'air') {
      try { await bot.placeBlock(below, v(0,1,0)); await skills.wait(100); return true; } catch(e) {}
    }
    for (const [ddx,ddy,ddz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
      const adj = bot.blockAt(v(x+ddx, y+ddy, z+ddz));
      if (adj && adj.name !== 'air') {
        try { await bot.placeBlock(adj, v(-ddx,-ddy,-ddz)); await skills.wait(100); return true; } catch(e) {}
      }
    }
    return false;
  };

  // 1. Floor
  skills.log('Building floor...');
  for (let bx = hx1; bx <= hx2; bx++) {
    for (let bz = hz1; bz <= hz2; bz++) {
      const ok = await placeIfEmpty(bx, floorY, bz, 'oak_planks');
      if (!ok) await placeIfEmpty(bx, floorY, bz, 'dirt');
    }
  }

  // 2. Walls
  skills.log('Building walls...');
  const wallBlocks = ['oak_planks', 'dirt'];
  for (let layer = 1; layer <= 3; layer++) {
    const wy = floorY + layer;
    for (let bx = hx1; bx <= hx2; bx++) {
      for (let bz = hz1; bz <= hz2; bz++) {
        if (bx > hx1 && bx < hx2 && bz > hz1 && bz < hz2) continue;
        if (bz === hz1 && bx === cx && layer <= 2) continue;
        let placed = false;
        for (const bn of wallBlocks) {
          if (placed) break;
          placed = await placeIfEmpty(bx, wy, bz, bn);
        }
      }
    }
  }

  // 3. Roof
  skills.log('Building roof...');
  for (let bx = hx1; bx <= hx2; bx++) {
    for (let bz = hz1; bz <= hz2; bz++) {
      let placed = false;
      for (const bn of ['oak_planks', 'dirt']) {
        if (placed) break;
        placed = await placeIfEmpty(bx, floorY + 4, bz, bn);
      }
    }
  }

  // 4. Door
  skills.log('Placing door...');
  const doorItems = bot.inventory.items().filter(i => i.name === 'oak_door');
  if (doorItems.length > 0) {
    await bot.equip(doorItems[0], 'hand');
    const doorX = cx;
    const doorZ = hz1 - 1;
    const refBlock = bot.blockAt(v(doorX, floorY, doorZ));
    if (refBlock && refBlock.name !== 'air') {
      try { await bot.placeBlock(refBlock, v(0,0,1)); skills.log('Door placed!'); } catch(e) { skills.log(`Door err: ${e.message}`); }
    } else {
      const sideBlock = bot.blockAt(v(doorX - 1, floorY, hz1));
      if (sideBlock && sideBlock.name !== 'air') {
        try { await bot.placeBlock(sideBlock, v(1,0,0)); skills.log('Door placed (side)!'); } catch(e) { skills.log(`Door err: ${e.message}`); }
      }
    }
  }

  skills.say('Maison terminée ! 🏠');
  return { houseAt: { x: hx1, y: floorY, z: hz1, w: 7, d: 5, h: 4 } };
}