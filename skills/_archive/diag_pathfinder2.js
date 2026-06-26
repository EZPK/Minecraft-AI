/** Check what goal is active and why. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;
  
  // Check current goal
  const goal = pf.goal;
  skills.log("Goal type: " + (goal?.constructor?.name || 'none'));
  
  // Clear and see if it comes back
  pf.setGoal(null);
  skills.log("Cleared goal");
  await skills.wait(2000);
  skills.log("After 2s, goal: " + (pf.goal ? 'still set!' : 'null'));
  
  if (pf.goal) {
    // Something is re-setting it. Try disabling dynamic
    pf.setGoal(null);
    // Maybe the goal's 'dynamic' option is causing issues
    // Let's listen for goal changes
    const onGoal = (g) => { skills.log("Goal changed to: " + (g?.constructor?.name || 'null')); };
    bot.on('path_update', onGoal);
    await skills.wait(3000);
    bot.removeListener('path_update', onGoal);
  }
  
  return "done";
}