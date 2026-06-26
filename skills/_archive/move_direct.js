/** Move a short distance using direct controls (no pathfinder). */
export default async function (skills, args) {
  const bot = skills.bot;
  const targetX = args.x ?? bot.entity.position.x;
  const targetZ = args.z ?? bot.entity.position.z;
  
  // Clear any pathfinder state
  bot.pathfinder.stop();
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  await skills.wait(100);
  
  const pos = bot.entity.position;
  const dx = targetX + 0.5 - pos.x;
  const dz = targetZ + 0.5 - pos.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  
  if (dist < 1.5) {
    skills.log("Already there");
    return "arrived";
  }
  
  // Look towards target
  const yaw = Math.atan2(-dx, -dz);
  bot.look(yaw, 0, true);
  await skills.wait(100);
  
  // Walk until close
  bot.setControlState('forward', true);
  let moved = false;
  const startDist = dist;
  
  for (let i = 0; i < 60; i++) {
    await skills.wait(250);
    const cur = bot.entity.position;
    const curDist = Math.sqrt((targetX+0.5 - cur.x)**2 + (targetZ+0.5 - cur.z)**2);
    const movedDist = cur.distanceTo(pos);
    
    if (curDist < 1.5) {
      bot.setControlState('forward', false);
      skills.log(`Arrived after ${(i+1)*250}ms`);
      return "arrived";
    }
    if (movedDist > 0.1) moved = true;
  }
  
  bot.setControlState('forward', false);
  skills.log(moved ? "Moved but didn't reach target" : "Didn't move at all");
  return moved ? "partial" : "stuck";
}