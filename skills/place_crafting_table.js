/** Place a crafting table from inventory onto a suitable adjacent spot. */
export default async function (skills, args) {
  const pos = skills.bot.entity.position.floored();
  const craftingTable = skills.bot.inventory.items().find(i => i.name === "crafting_table");
  if (!craftingTable) {
    skills.log("No crafting table in inventory to place.");
    return { success: false, reason: "no crafting table" };
  }
  
  // Try several offsets around the bot to find a placeable spot
  const offsets = [
    [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  ];
  
  for (const [dx, dy, dz] of offsets) {
    const target = pos.offset(dx, dy, dz);
    if (!target) continue;
    const targetBlock = skills.bot.blockAt(target);
    if (targetBlock && targetBlock.name !== "air") continue;
    
    // Check if there's a solid block adjacent to the target
    const adjOffsets = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]];
    for (const [adx, ady, adz] of adjOffsets) {
      const adj = target.offset(adx, ady, adz);
      const adjBlock = skills.bot.blockAt(adj);
      if (adjBlock && adjBlock.name !== "air") {
        try {
          await skills.bot.equip(craftingTable, "hand");
          await skills.bot.placeBlock(adjBlock, adj.clone().subtract(adjBlock.position));
          skills.log(`Placed crafting table at ${target}`);
          return { success: true, position: target };
        } catch (e) {
          skills.log(`Failed at ${target}: ${e.message}`);
        }
        break;
      }
    }
  }
  
  return { success: false, reason: "no suitable placement spot found" };
}
