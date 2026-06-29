/** Move relative to current position using keyboard controls */
export default async function (skills, args) {
  const dir = args.dir ?? "east";
  const dist = args.distance ?? 3;
  const ms = dist * 600;
  
  const controls = { east: "right", west: "left", north: "forward", south: "back" };
  const ctrl = controls[dir] || "forward";
  
  skills.bot.setControlState(ctrl, true);
  await skills.wait(ms);
  skills.bot.setControlState(ctrl, false);
  
  skills.log(`Moved ${dir} for ${ms}ms, now at ${skills.bot.entity.position}`);
  return { position: skills.bot.entity.position };
}