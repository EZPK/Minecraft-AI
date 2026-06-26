/** Track goal state after clearing. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;

  const events = bot.eventNames();
  skills.log("Bot events: " + events.join(", "));
  skills.log("goal_updated listeners: " + bot.listenerCount("goal_updated"));
  skills.log("path_update listeners: " + bot.listenerCount("path_update"));
  skills.log("goal_reached listeners: " + bot.listenerCount("goal_reached"));
  skills.log("physicsTick listeners: " + bot.listenerCount("physicsTick"));

  // Clear and poll
  pf.setGoal(null);
  for (let i = 0; i < 10; i++) {
    await skills.wait(500);
    const g = pf.goal;
    skills.log(`tick ${i}: goal = ${g ? g.constructor.name + " (" + g.x + "," + g.y + "," + g.z + ")" : "null"}`);
  }

  return "done";
}