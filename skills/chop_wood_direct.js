/** Walk to the nearest tree and chop it by looking and digging directly. */
export default async function (skills, args) {
  const blockType = args.block || "oak_log";
  const count = args.count ?? 6;
  const bot = skills.bot;
  
  // Find oak logs
  const logs = bot.findBlocks({
    matching: (b) => b.name === blockType,
    maxDistance: 16,
    count: 10
  });
  
  if (!logs || logs.length === 0) {
    skills.say("Je ne trouve pas d'arbres!");
    return 0;
  }
  
  skills.say(`Je vois ${logs.length} ${blockType}, je vais en couper ${count}!`);
  
  let dug = 0;
  for (const pos of logs) {
    if (dug >= count) break;
    
    const block = bot.blockAt(pos);
    if (!block) continue;
    
    // Goto near the block
    try {
      await skills.goto(pos.x + 0.5, pos.y, pos.z + 0.5, 2);
    } catch (e) {
      skills.log(`Cannot path to ${pos}: ${e.message}`);
      continue;
    }
    
    // Look at the block
    await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
    await skills.wait(200);
    
    // Dig
    if (bot.canDigBlock(block)) {
      try {
        await bot.dig(block);
        dug++;
        skills.log(`Dug ${blockType} #${dug} at ${pos}`);
        await skills.wait(500);
      } catch (e) {
        skills.log(`Dig failed: ${e.message}`);
      }
    }
  }
  
  skills.say(`J'ai coupé ${dug} bûches!`);
  return dug;
}