/** Empty all slots (output, input, fuel) of the nearest furnace */
export default async function (skills, args) {
  const bot = skills.bot;
  const furnaceBlock = bot.findBlock({
    matching: (block) => block.name === "furnace" || block.name === "lit_furnace",
    maxDistance: 6,
  });
  if (!furnaceBlock) throw new Error("No furnace nearby");
  await skills.goto(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z, 2);
  const furnace = await bot.openFurnace(furnaceBlock);
  try {
    const output = furnace.outputItem();
    if (output) {
      skills.log(`Taking ${output.count}x ${output.name} from output`);
      await furnace.takeOutput(output.type, output.metadata, output.count);
      skills.log("Done");
    } else {
      skills.log("Output is empty");
    }
    // Also clear input and fuel
    const input = furnace.inputItem();
    if (input) {
      await furnace.takeInput(input.type, input.metadata, input.count);
      skills.log(`Took back ${input.count}x ${input.name} from input`);
    }
    const fuel = furnace.fuelItem();
    if (fuel) {
      await furnace.takeFuel(fuel.type, fuel.metadata, fuel.count);
      skills.log(`Took back ${fuel.count}x ${fuel.name} from fuel`);
    }
  } finally {
    furnace.close();
  }
  return {};
}