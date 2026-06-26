/** Manual walk to a coordinate using setControlState (no pathfinder). */
export default async function (skills, args) {
  const bot = skills.bot;
  const targetX = args.x ?? 26;
  const targetZ = args.z ?? 8;
  
  // Kill the pathfinder goal
  bot.pathfinder.setGoal(null);
  bot.pathfinder.stop();
  bot.clearControlStates();
  await skills.wait(200);
  
  // Check direction
  const pos = bot.entity.position;
  const dx = targetX + 0.5 - pos.x;
  const dz = targetZ + 0.5 - pos.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  
  skills.log(`Walking from (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) to (${targetX}, ${targetZ}) — dist=${dist.toFixed(1)}`);
  
  if (dist < 1) {
    skills.log("Already there!");
    return "arrived";
  }
  
  // Look in the right direction
  const yaw = Math.atan2(-dx, -dz);
  bot.look(yaw, 0, false);
  await skills.wait(100);
  
  // Walk forward
  bot.setControlState('forward', true);
  
  // Wait until close
  let elapsed = 0;
  while (elapsed < 15000) {
    await skills.wait(200);
    elapsed += 200;
    const cur = bot.entity.position;
    const cd = Math.sqrt((targetX+0.5 - cur.x)**2 + (targetZ+0.5 - cur.z)**2);
    if (cd < 1.5) {
      bot.setControlState('forward', false);
      skills.log(`✅ Arrived in ${elapsed}ms`);
      return "arrived";
    }
  }
  
  bot.setControlState('forward', false);
  skills.log("⚠️ Timeout walking");
  return "timeout";
}