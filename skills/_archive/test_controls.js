/** Test if setControlState works. */
export default async function (skills, args) {
  const bot = skills.bot;
  
  // Reset everything
  bot.pathfinder.stop();
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  await skills.wait(500);
  
  // Check entity controls
  skills.log(`entity.controls: ${JSON.stringify(Object.fromEntries(Object.entries(bot.entity).filter(([k]) => k === 'forward' || k === 'jump' || k === 'sneak')))}`);
  
  // Set forward and check
  bot.setControlState('forward', true);
  skills.log(`After set forward: ${bot.control ? 'controls exist' : 'no controls'}`);
  
  // Look in a simple direction (south)
  bot.look(0, 0, true);
  await skills.wait(100);
  
  const pos1 = bot.entity.position.clone();
  await skills.wait(2000);
  const pos2 = bot.entity.position.clone();
  
  bot.setControlState('forward', false);
  
  const dist = pos1.distanceTo(pos2);
  skills.log(`Moved: ${dist.toFixed(3)} blocks`);
  skills.log(`From: ${pos1.x.toFixed(2)},${pos1.z.toFixed(2)} To: ${pos2.x.toFixed(2)},${pos2.z.toFixed(2)}`);
  
  return "done";
}