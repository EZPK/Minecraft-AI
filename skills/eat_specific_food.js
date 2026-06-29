/** Eat a specific food item from inventory */
export default async function (skills, args) {
  const foodName = args.item || "cooked_chicken";
  const bot = skills.bot;
  
  await skills.equip(foodName);
  skills.log(`Equipped ${foodName}, consuming...`);
  
  // Consume it
  await bot.consume();
  await skills.wait(2000);
  
  skills.log(`Ate ${foodName}. Health: ${bot.health}, Food: ${bot.food}`);
  return { ate: foodName, health: bot.health, food: bot.food };
}