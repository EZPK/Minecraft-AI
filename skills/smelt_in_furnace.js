/** Smelt items in the nearest furnace. Auto-navigates, waits for output, reclaims unused input/fuel. */
export default async function (skills, args) {
  const inputName = args.input;
  const fuelName = args.fuel ?? 'coal';
  const count = args.count ?? 1;
  if (!inputName) throw new Error('"input" is required (e.g. "raw_iron")');

  const bot = skills.bot;

  const furnaceBlock = bot.findBlock({
    matching: b => b.name === 'furnace' || b.name === 'lit_furnace',
    maxDistance: 6,
  });
  if (!furnaceBlock) throw new Error('No furnace within 6 blocks');

  const { x, y, z } = furnaceBlock.position;
  await skills.goto(x, y, z, 2);

  const furnace = await bot.openFurnace(furnaceBlock);
  try {
    const inputItem = bot.inventory.items().find(i => i.name === inputName);
    if (!inputItem) throw new Error(`No ${inputName} in inventory`);
    const fuelItem = bot.inventory.items().find(i => i.name === fuelName);
    if (!fuelItem) throw new Error(`No ${fuelName} in inventory`);

    const toSmelt = Math.min(count, inputItem.count);
    // Coal smelts 8 items; use at least 1 unit of fuel
    const fuelNeeded = Math.max(1, Math.ceil(toSmelt / 8));

    skills.log(`Smelting ${toSmelt}× ${inputName} with ${fuelNeeded}× ${fuelName}`);

    await furnace.putFuel(fuelItem.type, null, Math.min(fuelNeeded, fuelItem.count));
    await skills.wait(300);
    await furnace.putInput(inputItem.type, null, toSmelt);

    const waitMs = Math.min(toSmelt * 10_500, 120_000);
    skills.log(`Waiting ${Math.round(waitMs / 1000)}s for smelting…`);
    await skills.wait(waitMs);

    // Take output, retry once if not ready yet
    let out = furnace.outputItem();
    if (!out) {
      skills.log('No output yet, waiting 12 more seconds…');
      await skills.wait(12_000);
      out = furnace.outputItem();
    }

    let taken = 0;
    if (out) {
      await furnace.takeOutput(out.type, out.metadata, out.count);
      taken = out.count;
      skills.log(`Took ${taken}× ${out.name}`);
    } else {
      skills.log('Warning: no output after extended wait — furnace may lack fuel');
    }

    // Reclaim leftover input and fuel
    const leftInput = furnace.inputItem();
    if (leftInput) await furnace.takeInput(leftInput.type, leftInput.metadata, leftInput.count);
    const leftFuel = furnace.fuelItem();
    if (leftFuel) await furnace.takeFuel(leftFuel.type, leftFuel.metadata, leftFuel.count);

    return { smelted: inputName, output: taken };
  } finally {
    furnace.close();
  }
}
