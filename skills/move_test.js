/** Test movement after resetting pathfinder. */
export default async function (skills, args) {
  const bot = skills.bot;
  bot.pathfinder.setGoal(null);
  await skills.wait(500);
  skills.log("Cleared goals, testing pathfinder...");
  
  try {
    await skills.goto(26, 69, 10, 2);
    skills.log("SUCCESS: moved to (26, 69, 10)");
  } catch (e) {
    // Try without pathfinder
    skills.log("Pathfinder error: " + (e?.message ?? e));
    skills.log("Falling back to direct movement...");
    
    // Direct movement using controls
    const target = { x: 26, z: 10 };
    const dx = target.x - bot.entity.position.x;
    const dz = target.z - bot.entity.position.z;
    
    bot.setControlState('forward', true);
    
    // Simple approach: move forward until close
    await new Promise(resolve => {
      const check = setInterval(() => {
        const dist = Math.sqrt(
          (target.x - bot.entity.position.x) ** 2 +
          (target.z - bot.entity.position.z) ** 2
        );
        if (dist < 2) {
          bot.setControlState('forward', false);
          clearInterval(check);
          resolve(true);
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        bot.setControlState('forward', false);
        clearInterval(check);
        resolve(false);
      }, 10000);
    });
    
    skills.log("Direct move done at " + JSON.stringify(bot.entity.position));
  }
  
  return "ok";
}