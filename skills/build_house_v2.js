/** Build a small house using proper Vec3 API */
import Vec3 from 'vec3';

export default async function (skills, args) {
  const bot = skills.bot;
  const p = bot.entity.position;
  const cx = Math.floor(p.x), cz = Math.floor(p.z);
  const groundY = Math.floor(p.y) - 1;

  const w = args.width ?? 5;
  const d = args.depth ?? 5;
  const wallH = args.wall_height ?? 2;
  const block = args.block ?? "oak_planks";

  const x0 = cx - Math.floor(w/2);
  const z0 = cz - Math.floor(d/2);
  const floorY = groundY + 1;

  skills.log(`Building at (${x0},${floorY},${z0}), ${w}×${d}×${wallH}`);

  // Equip the block
  const items = bot.inventory.items();
  const blockItem = items.find(i => i.name === block);
  if (!blockItem) { skills.log(`No ${block}`); return { placed: 0 }; }
  await bot.equip(blockItem, "hand");

  let placed = 0;

  async function placeBlock(xx, yy, zz) {
    const pos = new Vec3(xx, yy, zz);
    const existing = bot.blockAt(pos);
    if (existing && existing.name !== "air") return false;

    // Try to find a reference block
    const refs = [
      { pos: new Vec3(xx, yy-1, zz), dir: new Vec3(0, 1, 0) },
      { pos: new Vec3(xx-1, yy, zz), dir: new Vec3(1, 0, 0) },
      { pos: new Vec3(xx+1, yy, zz), dir: new Vec3(-1, 0, 0) },
      { pos: new Vec3(xx, yy, zz-1), dir: new Vec3(0, 0, 1) },
      { pos: new Vec3(xx, yy, zz+1), dir: new Vec3(0, 0, -1) },
    ];

    for (const ref of refs) {
      const block = bot.blockAt(ref.pos);
      if (block && block.name !== "air") {
        try {
          const lookAt = ref.pos.offset(0.5, 0.5, 0.5);
          await bot.lookAt(lookAt, true);
          await bot.placeBlock(block, ref.dir);
          placed++;
          await skills.wait(150);
          return true;
        } catch (e) {
          // Try next ref
        }
      }
    }
    skills.log(`Cannot place at ${xx},${yy},${zz}`);
    return false;
  }

  // Floor
  skills.log("Floor...");
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      await placeBlock(x0 + dx, floorY, z0 + dz);

  // Walls
  skills.log("Walls...");
  const doorX = cx;
  for (let layer = 1; layer <= wallH; layer++) {
    const wy = floorY + layer;
    for (let bx = x0; bx < x0 + w; bx++) {
      for (let bz = z0; bz < z0 + d; bz++) {
        const p = bx === x0 || bx === x0 + w - 1 || bz === z0 || bz === z0 + d - 1;
        if (!p) continue;
        if (bz === z0 && bx === doorX && layer <= 2) continue;
        await placeBlock(bx, wy, bz);
      }
    }
  }

  // Roof
  skills.log("Roof...");
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      await placeBlock(x0 + dx, floorY + wallH + 1, z0 + dz);

  skills.log(`Placed ${placed} blocks`);
  return { placed, origin: { x: x0, y: floorY, z: z0 }, width: w, depth: d };
}