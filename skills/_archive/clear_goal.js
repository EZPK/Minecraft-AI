/** Aggressively clear the stale pathfinder goal. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;

  // Clear repeatedly to catch any re-setting code
  for (let i = 0; i < 5; i++) {
    pf.setGoal(null);
    await skills.wait(100);
  }

  // Check if any pending collectBlock task
  if (bot.collectBlock) {
    skills.log("collectBlock available");
  }

  // Wait longer to see if goal stays null
  await skills.wait(2000);
  skills.log("After aggressive clear, goal: " + (pf.goal ? pf.goal.constructor.name : "null"));

  // If still set, try one more thing: stop and clear again
  if (pf.goal) {
    bot.pathfinder.stop(); // This sets stateGoal = null
    await skills.wait(500);
    skills.log("After stop(), goal: " + (pf.goal ? pf.goal.constructor.name : "null"));
  }

  return "done";
}