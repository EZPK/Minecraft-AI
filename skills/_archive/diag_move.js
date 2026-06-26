/** Diagnose why bot isn't moving. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pos = bot.entity.position;
  
  // Check onGround
  skills.log(`onGround: ${bot.entity.onGround}`);
  skills.log(`Position: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
  
  // Check what block is below
  const Vec3 = (await import("vec3")).Vec3;
  const below = bot.blockAt(new Vec3(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)));
  skills.log(`Below block: ${below?.name || 'none'}`);
  
  // Check if there's a block in front
  const yaw = bot.entity.yaw;
  const lookX = -Math.sin(yaw);
  const lookZ = -Math.cos(yaw);
  skills.log(`Yaw: ${yaw.toFixed(2)}, look vector: ${lookX.toFixed(2)}, ${lookZ.toFixed(2)}`);
  
  // Check if forward is working by trying to move and checking position changes
  const startX = pos.x;
  const startZ = pos.z;
  
  bot.setControlState('forward', true);
  await skills.wait(2000);
  bot.setControlState('forward', false);
  
  const endPos = bot.entity.position;
  skills.log(`Start: ${startX.toFixed(2)}, ${startZ.toFixed(2)}`);
  skills.log(`End: ${endPos.x.toFixed(2)}, ${endPos.z.toFixed(2)}`);
  skills.log(`Delta: ${(endPos.x - startX).toFixed(3)}, ${(endPos.z - startZ).toFixed(3)}`);
  
  return "done";
}