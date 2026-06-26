/** Reset pathfinder movements and try a fresh goto. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;

  // Access mineflayer-pathfinder exports
  const pkg = await import("mineflayer-pathfinder");
  const { Movements, goals } = pkg.default;

  // Re-create and assign movements
  const mov = new Movements(bot);
  mov.canDig = true;
  mov.allowParkour = true;
  mov.allow1by1towers = true;
  pf.setMovements(mov);
  skills.log("Movements re-created and assigned ✓");

  // Clear any stale goal
  pf.setGoal(null);
  await skills.wait(300);

  // Set a fresh goal
  const goal = new goals.GoalNear(26, 69, 8, 1);
  pf.setGoal(goal, false);
  skills.log("Goal set → (26,69,8) range=1");

  // Wait until the goal is reached (or timeout 15s)
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      bot.removeListener("goal_reached", handler);
      resolve("timeout");
    }, 15_000);
    const handler = () => {
      clearTimeout(timer);
      resolve("reached");
    };
    bot.once("goal_reached", handler);
  });

  skills.log(`Result: ${result} at ${JSON.stringify(bot.entity.position)}`);
  return result;
}