/** Build a small wooden hut at a given origin. Stays on the ground, digs/places within reach. */
import { Vec3 } from "vec3";

export default async function (skills, args) {
  const origin = args.origin ?? { x: 24, y: 68, z: 7 };
  const size = args.size ?? 4;
  const height = args.height ?? 3;
  const block = args.block ?? "oak_planks";

  const sx = Math.floor(origin.x);
  const sy = Math.floor(origin.y);
  const sz = Math.floor(origin.z);

  skills.say("🏗️ Je construis ma cabane !");

  const bot = skills.bot;
  const AIR = new Set(["air", "cave_air", "void_air", "grass", "tall_grass", "short_grass", "fern", "large_fern", "vine"]);
  let placed = 0;
  let cleared = 0;

  // Walk to the area centre once
  await skills.goto(sx + size / 2, sy, sz + size / 2, 2);

  async function ensureClear(x, y, z) {
    const targetBlock = bot.blockAt(new Vec3(x, y, z));
    if (targetBlock && !AIR.has(targetBlock.name)) {
      try {
        // Move closer if out of reach
        const dist = bot.entity.position.distanceTo(targetBlock.position);
        if (dist > 4) await skills.goto(x, sy, z, 2);
        await bot.dig(targetBlock);
        await skills.wait(200);
        cleared++;
      } catch (e) {
        skills.log(`Could not clear (${x},${y},${z}): ${e?.message ?? e}`);
      }
    }
  }

  async function placeAt(x, y, z) {
    await ensureClear(x, y, z);
    try {
      const dist = bot.entity.position.distanceTo(new Vec3(x + 0.5, sy, z + 0.5));
      if (dist > 4) await skills.goto(x, sy, z, 2);
      await skills.wait(200);
      await skills.place(block, x, y, z);
      placed++;
    } catch (e) {
      skills.log(`Failed to place at (${x},${y},${z}): ${e?.message ?? e}`);
    }
  }

  // --- Floor at sy+1 ---
  skills.say("🟫 Plancher...");
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      await placeAt(sx + x, sy + 1, sz + z);
    }
  }
  skills.say(`✅ Sol fini (${placed} planches)`);

  // --- Walls ---
  for (let y = 0; y < height; y++) {
    const wy = sy + 1 + y;
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        if (x === 0 || x === size - 1 || z === 0 || z === size - 1) {
          if (z === 0 && y < 2 && x >= 1 && x <= 2) continue;
          await placeAt(sx + x, wy, sz + z);
        }
      }
    }
  }
  skills.say("🧱 Murs terminés !");

  // --- Roof ---
  const roofY = sy + 1 + height;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      await placeAt(sx + x, roofY, sz + z);
    }
  }

  skills.say(`🏠 Cabane finie ! ${placed} planches posées, ${cleared} blocs retirés.`);
  return { placed, cleared };
}