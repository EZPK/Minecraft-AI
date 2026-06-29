/** Craft an item using a nearby crafting table. */
export default async function (skills, args) {
  if (!args.item) throw new Error("item is required");
  const count = Number(args.count ?? 1);
  skills.log(`Crafting ${count}× ${args.item}`);
  await skills.craft(String(args.item), count);
  skills.log(`Crafted ${count}× ${args.item}`);
  return { crafted: args.item, count };
}
