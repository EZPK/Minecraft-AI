/** Place a torch near the bot when it's dark/underground (low light), to keep
 * mobs from spawning. Crafts torches from coal/charcoal + sticks if none are
 * held. Args: { force?: boolean, threshold?: number }. Returns { placed, light }. */
export default async function (skills, args) {
  const bot = skills.bot;
  const { Vec3 } = await import("vec3");
  const force = args.force ?? false;
  const threshold = args.threshold ?? 7; // hostile mobs spawn at light <= 7

  const feet = bot.entity.position.floored();
  const here = bot.blockAt(feet);
  const light = here ? here.light : 0;
  const skyLight = here ? here.skyLight : 15;
  // Dark enough to matter: underground (no sky access) or low block light.
  const dark = skyLight === 0 || light <= threshold;
  if (!force && !dark) {
    skills.log(`Light ${light} (sky ${skyLight}) is fine — no torch needed`);
    return { placed: false, light };
  }

  // Make sure we have a torch; craft from coal/charcoal + stick if we can.
  let torch = bot.inventory.items().find((i) => i.name === "torch");
  if (!torch) {
    const coal = bot.inventory
      .items()
      .find((i) => i.name === "coal" || i.name === "charcoal");
    const stick = bot.inventory.items().find((i) => i.name === "stick");
    if (coal && stick) {
      try {
        await skills.craft("torch", 1);
        skills.log("Crafted torches");
      } catch (e) {
        skills.log(`Could not craft torches: ${e.message}`);
      }
      torch = bot.inventory.items().find((i) => i.name === "torch");
    }
  }
  if (!torch) {
    skills.log("No torch and can't craft one (need coal/charcoal + a stick)");
    return { placed: false, light, reason: "no_torch" };
  }

  // Air cells around the bot we could put a torch in. In a 1×1 shaft only feet
  // and head are open, so include both; on open ground try the sides too.
  const cells = [
    feet,
    feet.offset(0, 1, 0),
    feet.offset(1, 0, 0),
    feet.offset(-1, 0, 0),
    feet.offset(0, 0, 1),
    feet.offset(0, 0, -1),
  ];
  // A torch attaches to the top of a floor or the side of a wall, so each cell
  // needs a solid neighbour to place against.
  const supportDirs = [
    new Vec3(0, -1, 0),
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1),
  ];

  for (const cell of cells) {
    const at = bot.blockAt(cell);
    if (!at || at.boundingBox !== "empty") continue; // need air to place into
    for (const dir of supportDirs) {
      skills.throwIfAborted();
      const support = bot.blockAt(cell.plus(dir));
      if (!support || support.boundingBox !== "block") continue;
      const face = dir.scaled(-1); // from support toward the torch cell
      try {
        await bot.equip(torch, "hand");
        await bot.placeBlock(support, face);
        skills.log(`Torch placed at ${cell.x}, ${cell.y}, ${cell.z}`);
        return { placed: true, at: { x: cell.x, y: cell.y, z: cell.z }, light };
      } catch {
        // Spot didn't work (occupied/out of reach); try the next one.
      }
    }
  }

  skills.log("Couldn't find a spot to place a torch");
  return { placed: false, light, reason: "no_spot" };
}
