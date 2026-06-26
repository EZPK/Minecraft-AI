/** Inspect goal_updated listener source. */
export default async function (skills, args) {
  const bot = skills.bot;
  
  // Get the listeners
  const listeners = bot.listeners('goal_updated');
  skills.log("goal_updated listeners count: " + listeners.length);
  
  for (let i = 0; i < listeners.length; i++) {
    const fn = listeners[i];
    const src = fn.toString().substring(0, 200);
    skills.log(`Listener ${i}: ${src}`);
  }
  
  // Also check goal_reached
  const grListeners = bot.listeners('goal_reached');
  skills.log("goal_reached listeners: " + grListeners.length);
  for (let i = 0; i < grListeners.length; i++) {
    const src = grListeners[i].toString().substring(0, 200);
    skills.log(`GR Listener ${i}: ${src}`);
  }
  
  return "done";
}