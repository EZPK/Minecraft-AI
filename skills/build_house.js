/** Flatten the footprint then build a wooden house at the current position. Width/depth/block are configurable. */
export default async function (skills, args) {
  const bot = skills.bot;
  const p = bot.entity.position;
  const cx = Math.floor(p.x), cz = Math.floor(p.z);
  const groundY = Math.floor(p.y) - 1;

  const w = args.width ?? 7;
  const d = args.depth ?? 5;
  const wallHeight = args.wall_height ?? 3;
  const block = args.block ?? 'oak_planks';

  const x0 = cx - Math.floor(w / 2);
  const z0 = cz - Math.floor(d / 2);
  const floorY = groundY + 1;

  skills.log(`Building ${w}×${d} house at (${x0},${floorY},${z0})`);

  const AIR = new Set([
    'air', 'cave_air', 'void_air',
    'grass', 'tall_grass', 'short_grass', 'fern', 'large_fern',
    'dead_bush', 'vine', 'snow',
  ]);

  function blockAt(xx, yy, zz) {
    return bot.blockAt({ x: xx, y: yy, z: zz });
  }

  // ── Phase 1: clear footprint ────────────────────────────────────────────────
  skills.log('Clearing footprint…');
  for (let bx = x0; bx < x0 + w; bx++) {
    for (let bz = z0; bz < z0 + d; bz++) {
      for (let by = floorY; by <= floorY + wallHeight + 1; by++) {
        const blk = blockAt(bx, by, bz);
        if (blk && !AIR.has(blk.name) && blk.name !== 'bedrock') {
          try {
            await skills.goto(bx, floorY, bz, 3);
            await skills.dig(bx, by, bz);
            await skills.wait(80);
          } catch { /* skip unreachable */ }
        }
      }
    }
  }

  // ── Phase 2: floor ──────────────────────────────────────────────────────────
  skills.log('Floor…');
  let placed = 0;
  for (let bx = x0; bx < x0 + w; bx++) {
    for (let bz = z0; bz < z0 + d; bz++) {
      try { await skills.place(block, bx, floorY, bz); placed++; } catch { }
    }
  }

  // ── Phase 3: walls ──────────────────────────────────────────────────────────
  skills.log('Walls…');
  const doorX = cx;
  for (let layer = 1; layer <= wallHeight; layer++) {
    const wy = floorY + layer;
    for (let bx = x0; bx < x0 + w; bx++) {
      for (let bz = z0; bz < z0 + d; bz++) {
        const isPerimeter = bx === x0 || bx === x0 + w - 1 || bz === z0 || bz === z0 + d - 1;
        if (!isPerimeter) continue;
        if (bz === z0 && bx === doorX && layer <= 2) continue;
        try { await skills.place(block, bx, wy, bz); placed++; } catch { }
      }
    }
  }

  // ── Phase 4: roof ───────────────────────────────────────────────────────────
  skills.log('Roof…');
  const roofY = floorY + wallHeight + 1;
  for (let bx = x0; bx < x0 + w; bx++) {
    for (let bz = z0; bz < z0 + d; bz++) {
      try { await skills.place(block, bx, roofY, bz); placed++; } catch { }
    }
  }

  // ── Phase 5: door ───────────────────────────────────────────────────────────
  const doorItem = bot.inventory.items().find(i => i.name.endsWith('_door'));
  if (doorItem) {
    try {
      await skills.place(doorItem.name, doorX, floorY + 1, z0);
      skills.log('Door placed');
      placed++;
    } catch (e) {
      skills.log(`Door skipped: ${e.message}`);
    }
  } else {
    skills.log('No door in inventory — leave the opening as-is');
  }

  skills.log(`Done: ${placed} blocks placed`);
  return { origin: { x: x0, y: floorY, z: z0 }, width: w, depth: d, placed };
}