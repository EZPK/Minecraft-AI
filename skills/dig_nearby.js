/** Dig the nearest block of a given type by directly approaching and digging without pathfinding. */
export default async function (skills, args) {
  const blockType = args.block;
  const count = args.count ?? 1;
  const radius = args.radius ?? 10;
  const bot = skills.bot;
  
  // Find blocks nearby using the bot's built-in findBlocks
  // bot.findBlocks works with block name
  const blocks = bot.findBlocks({
    matching: (b) => b.name === blockType,
    maxDistance: radius,
    count: count * 3
  });
  
  if (!blocks || blocks.length === 0) {
    skills.log(`No ${blockType} found nearby`);
    return 0;
  }
  
  let dug = 0;
  for (const pos of blocks) {
    if (dug >= count) break;
    
    const block = bot.blockAt(pos);
    if (!block) continue;
    
    // Check distance
    const dx = pos.x - bot.entity.position.x;
    const dz = pos.z - bot.entity.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    if (dist > 5) continue;
    
    // Look at the block
    await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
    await skills.wait(100);
    
    // Dig
    if (bot.canDigBlock(block)) {
      try {
        await bot.dig(block);
        dug++;
        skills.log(`Dug ${blockType} at ${pos}`);
        await skills.wait(300);
      } catch (e) {
        skills.log(`Failed to dig: ${e.message}`);
      }
    }
  }
  
  skills.log(`Dug ${dug}/${count} ${blockType}`);
  return dug;
}