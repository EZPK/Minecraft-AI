/** Diagnose pathfinder state. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;
  
  skills.log("Pathfinder available: " + !!pf);
  skills.log("Current goal: " + (pf?.goal ? 'set' : 'null'));
  skills.log("Movements: " + (pf?.movements ? 'set' : 'null'));
  
  if (pf?.movements) {
    skills.log("canDig: " + pf.movements.canDig);
    skills.log("allowParkour: " + pf.movements.allowParkour);
    skills.log("allow1by1towers: " + pf.movements.allow1by1towers);
  }
  
  // Try resetting
  pf.setGoal(null);
  await skills.wait(1000);
  
  // Try to set a new goal with the low-level method
  const Vec3 = (await import("vec3")).default;
  const pathfinderPkg = await import("mineflayer-pathfinder");
  const goals = pathfinderPkg.goals;
  
  try {
    const goal = new goals.GoalNear(26, 69, 10, 2);
    pf.setGoal(goal, false);
    skills.log("Goal set successfully");
    
    // Check if it's moving
    await skills.wait(3000);
    skills.log("After 3s, pos: " + JSON.stringify(bot.entity.position));
    
    if (pf.goal) {
      skills.log("Goal still active");
    }
  } catch (e) {
    skills.log("Error: " + (e?.message ?? e));
  }
  
  return "ok";
}