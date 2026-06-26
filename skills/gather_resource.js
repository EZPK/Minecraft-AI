/** Collect N of any block type, expanding search radius until enough is found or max_radius is reached. */
export default async function (skills, args) {
  if (!args.block) throw new Error('"block" arg is required (e.g. "oak_log", "stone", "iron_ore")');
  const block = args.block;
  const count = args.count ?? 1;
  const maxRadius = args.max_radius ?? 128;

  let collected = 0;
  let radius = 32;

  while (collected < count) {
    const need = count - collected;
    skills.log(`Searching for ${need}× ${block} within r=${radius}…`);
    const got = await skills.collectBlock(block, need, radius);
    collected += got;
    if (collected >= count) break;
    if (got === 0) {
      // Nothing found — expand search or give up
      if (radius >= maxRadius) {
        skills.log(`No more ${block} found within ${maxRadius} blocks`);
        break;
      }
      radius = Math.min(radius * 2, maxRadius);
    }
    // if got > 0 but short, loop again at same radius (more may exist nearby)
  }

  skills.log(`Collected ${collected}/${count} ${block}`);
  return { collected, requested: count, block };
}
