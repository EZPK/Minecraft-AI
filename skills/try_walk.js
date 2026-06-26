/** Try to walk manually with better controls. */
export default async function (skills, args) {
  const bot = skills.bot;
  
  // Completely stop everything
  bot.pathfinder.stop();
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  await skills.wait(500);
  
  const pos = bot.entity.position;
  skills.log(`Start pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
  
  // Try to move forward for 2 seconds
  bot.setControlState('forward', true);
  bot.setControlState('jump', true);
  
  await skills.wait(2000);
  
  bot.setControlState('forward', false);
  bot.setControlState('jump', false);
  
  const pos2 = bot.entity.position;
  skills.log(`End pos: ${pos2.x.toFixed(2)}, ${pos2.y.toFixed(2)}, ${pos2.z.toFixed(2)}`);
  skills.log(`Moved: ${pos.distanceTo(pos2).toFixed(2)} blocks`);
  
  return "done";
}