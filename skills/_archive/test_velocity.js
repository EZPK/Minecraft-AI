/** Check if bot can move at all via velocity. */
export default async function (skills, args) {
  const bot = skills.bot;
  
  // Try to directly set velocity
  const pos1 = bot.entity.position.clone();
  bot.entity.velocity.x = 2;
  bot.entity.velocity.z = 2;
  
  await skills.wait(1000);
  
  const pos2 = bot.entity.position.clone();
  skills.log(`Before: ${pos1.x.toFixed(3)}, ${pos1.z.toFixed(3)}`);
  skills.log(`After: ${pos2.x.toFixed(3)}, ${pos2.z.toFixed(3)}`);
  skills.log(`Moved: ${pos1.distanceTo(pos2).toFixed(3)}`);
  
  // Also try jumping
  bot.setControlState('jump', true);
  const y1 = bot.entity.position.y;
  await skills.wait(1000);
  const y2 = bot.entity.position.y;
  bot.setControlState('jump', false);
  skills.log(`Y before jump: ${y1.toFixed(2)}, after: ${y2.toFixed(2)}`);
  
  return "done";
}