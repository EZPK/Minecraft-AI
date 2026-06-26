/** Chop the nearest tree of a given wood type and collect the logs. */
export default async function (skills, args) {
  const wood = args.wood ?? "oak";
  const count = args.count ?? 4;
  const block = `${wood}_log`;
  skills.say(`Chopping ${count} ${wood} logs...`);
  const got = await skills.collectBlock(block, count, 64);
  skills.log(`Collected ${got} ${block}`);
  return { collected: got, block };
}
