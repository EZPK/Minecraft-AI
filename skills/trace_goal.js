/** Find what keeps re-setting the pathfinder goal. */
export default async function (skills, args) {
  const bot = skills.bot;
  const pf = bot.pathfinder;
  
  // Listen for goal changes
  let lastGoal = null;
  const handler = () => {
    const g = pf.goal;
    if (g !== lastGoal) {
      lastGoal = g;
      const cls = g?.constructor?.name || 'null';
      const pos = g?.x !== undefined ? `${g.x},${g.y},${g.z}` : '??';
      skills.log(`⚡ Goal changed → ${cls} ${pos}`);
    }
  };
  
  // Add to path_update
  bot.on('path_update', handler);
  
  // Also check bot events more generally
  const onSetControl = (ctrl, state) => {
    skills.log(`⚡ setControlState: ${ctrl}=${state}`);
  };
  // Can't easily intercept setControlState but we can try
  
  // Try to clear the goal and see what happens
  skills.log("About to clear goal...");
  pf.setGoal(null);
  await skills.wait(100);
  
  // Wait and watch
  await skills.wait(5000);
  
  bot.removeListener('path_update', handler);
  
  skills.log("Final goal: " + (pf.goal ? pf.goal.constructor.name : 'null'));
  
  return "done";
}