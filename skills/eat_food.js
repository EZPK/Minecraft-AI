/** Eat the held food item. */
export default async function (skills) {
  const bot = skills.bot;
  const held = bot.heldItem;
  if (!held || !held.name) {
    skills.log("Nothing in hand to eat");
    return { ate: null };
  }
  
  try {
    await bot.activateItem();
    // Wait for eating to complete
    await skills.wait(2000);
    skills.log(`Ate ${held.displayName || held.name}`);
    return { ate: held.name };
  } catch (e) {
    skills.log(`Failed to eat: ${e.message}`);
    return { ate: null, error: e.message };
  }
}