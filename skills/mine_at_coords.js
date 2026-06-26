/** Mine a block at specific coordinates by looking at it and digging. */
export default async function (skills, args) {
  const { x, y, z } = args;
  const bot = skills.bot;
  const { Vec3 } = await import('vec3');

  // Look at the block
  const block = bot.blockAt(new Vec3(x, y, z));
  if (!block) {
    skills.log(`No block at ${x}, ${y}, ${z}`);
    return false;
  }
  
  skills.log(`Mining ${block.name} at ${x}, ${y}, ${z}`);
  
  // Move close first
  await skills.goto(x + 0.5, y, z + 0.5, 3);
  
  // Look at the block
  await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
  
  // Dig it
  if (bot.canDigBlock(block)) {
    await bot.dig(block);
    skills.log(`Dug ${block.name}`);
    return true;
  }
  
  skills.log(`Cannot dig ${block.name}`);
  return false;
}