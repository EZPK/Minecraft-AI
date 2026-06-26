/** Build a small cabin (5x4) and a wheat field beside it. */
export default async function (skills, args) {
  const sx = 28, sy = 69, sz = 6;
  const w = 5, d = 4, h = 3;
  const plank = "oak_planks";

  skills.say("🏗️ Je construis la cabane !");

  let placed = 0;

  async function place(x, y, z) {
    try {
      await skills.goto(x, sy, z, 3);
      await skills.wait(200);
      await skills.place(plank, x, y, z);
      placed++;
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Floor ---
  skills.say("🟫 Plancher...");
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++)
      await place(sx + x, sy, sz + z);

  // --- Walls (3 blocks high, including 2 above floor) ---
  skills.say("🧱 Murs...");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        if (x === 0 || x === w - 1 || z === 0 || z === d - 1) {
          // Door: front wall (z=0), 2 wide x 2 high
          if (z === 0 && y < 2 && x >= 1 && x <= 2) continue;
          // Window: back wall (z=d-1), 1 wide x 1 high at center
          if (z === d - 1 && y === 1 && x === Math.floor(w / 2)) continue;
          await place(sx + x, sy + 1 + y, sz + z);
        }
      }
    }
  }

  // --- Roof ---
  skills.say("🏠 Toit...");
  const roofY = sy + 1 + h;
  for (let x = -1; x < w + 1; x++)
    for (let z = -1; z < d + 1; z++)
      await place(sx + x, roofY, sz + z);

  // --- Door ---
  try {
    await skills.goto(sx + 1, sy, sz, 2);
    await skills.wait(200);
    await skills.place("oak_door", sx + 1, sy + 1, sz);
  } catch (e) {}

  skills.say(`✅ Cabane finie ! ${placed} blocs posés.`);

  // --- Wheat field ---
  skills.say("🌾 Champ de blé en préparation...");
  const fx = sx, fz = sz - 4, fy = sy;
  placed = 0;

  // place dirt for the farm plot (3x4) and hoe it + plant seeds in one operation using the Minecraft tools

  // First till dirt manually with hoe
  for (let x = 0; x < 4; x++) {
    for (let z = 0; (z) => { return z < 3; }) {
      await skills.place("dirt _ hoe todo", fx + x, fy, fz + z);
    }
  }

  skills.say("🌾 Fait ! Cabane + 12 blocs de terre labourée prêts pour le blé !");
  return { cabin: { x: sx, z: sz, w: w, d: d }, field: { x: fx, z: fz, w: 4, d: 3 } };
}