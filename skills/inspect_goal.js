/** Inspect the goal in detail. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;
  
  const goal = pf.goal;
  if (!goal) {
    skills.log("No active goal");
    return "no_goal";
  }
  
  skills.log("Goal class: " + goal.constructor.name);
  
  // GoalNear has x, y, z, range
  const props = ['x', 'y', 'z', 'range'];
  let details = {};
  for (const p of props) {
    if (p in goal) details[p] = goal[p];
  }
  skills.log("Goal props: " + JSON.stringify(details));
  
  // Check if it's a GoalFollow
  if (goal.entity) {
    skills.log("Following entity: " + goal.entity.name + " type: " + goal.entity.type);
    skills.log("Entity UUID: " + goal.entity.uuid);
  } else if (goal.distance) {
    skills.log("Distance: " + goal.distance);
  }
  
  // Try to clear it once and for all by setting null and checking for event listeners
  const listeners = bot.listeners('path_update');
  skills.log("path_update listeners: " + listeners.length);
  
  const goalListeners = bot.listeners('goal_reached');
  skills.log("goal_reached listeners: " + goalListeners.length);
  
  return "done";
}