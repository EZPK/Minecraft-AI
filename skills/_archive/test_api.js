/** Test the skills API methods. */
export default async function (skills, args) {
  const bot = skills.bot;
  
  // Test inventory
  const inv = skills.inventory();
  skills.log("Inventory: " + JSON.stringify(inv));
  
  // Test finding item
  const planks = bot.inventory.items().find(i => i.name === "oak_planks");
  if (planks) {
    await bot.equip(planks, "hand");
    skills.log("Equipped planks");
  }
  
  // Test place
  const Vec3 = (await import("vec3")).default;
  const pos = new Vec3(30, 69, 8);
  const block = bot.blockAt(pos);
  skills.log("Block at (30,69,8): " + (block ? block.name : "null"));
  
  return "done";
}