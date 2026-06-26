/** Simplest forward movement test. */
export default async function (skills, args) {
  const bot = skills.bot;
  
  const pos1 = bot.entity.position.clone();
  skills.log(`Position before: ${pos1.x.toFixed(2)}, ${pos1.z.toFixed(2)}`);
  skills.log(`onGround: ${bot.entity.onGround}`);
  skills.log(`velocity: ${bot.entity.velocity.x.toFixed(3)}, ${bot.entity.velocity.y.toFixed(3)}, ${bot.entity.velocity.z.toFixed(3)}`);
  
  // Just press forward, no cleanup
  bot.setControlState('forward', true);
  
  await skills.wait(3000);
  
  const pos2 = bot.entity.position.clone();
  bot.setControlState('forward', false);
  
  skills.log(`Position after: ${pos2.x.toFixed(2)}, ${pos2.z.toFixed(2)}`);
  skills.log(`Distance moved: ${pos1.distanceTo(pos2).toFixed(3)}`);
  skills.log(`Velocity now: ${bot.entity.velocity.x.toFixed(3)}, ${bot.entity.velocity.y.toFixed(3)}, ${bot.entity.velocity.z.toFixed(3)}`);
  
  return "done";
}