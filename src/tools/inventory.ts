import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { guard, type ToolFactory } from "./context.js";

export const inventoryTools: ToolFactory = ({ bot }) => [
  defineTool({
    name: "inventory",
    label: "Inventory",
    description: "List the items currently in the bot's inventory.",
    parameters: Type.Object({}),
    execute: () =>
      guard("inventory", async () => {
        const items = bot.inventory.items();
        if (!items.length) return "Inventory is empty.";
        const counts = new Map<string, number>();
        for (const it of items) {
          counts.set(it.name, (counts.get(it.name) ?? 0) + it.count);
        }
        return [...counts.entries()]
          .map(([name, n]) => `- ${n}x ${name}`)
          .join("\n");
      }),
  }),

  defineTool({
    name: "craft",
    label: "Craft",
    description:
      "Craft an item. Uses a nearby crafting table when one is within reach (needed for 3x3 recipes).",
    parameters: Type.Object({
      item: Type.String({ description: "Item name to craft, e.g. \"stick\", \"chest\"." }),
      count: Type.Optional(Type.Number({ description: "Times to craft, default 1." })),
    }),
    execute: (_id, p) =>
      guard("craft", async () => {
        const itemId = bot.registry.itemsByName[p.item]?.id;
        if (itemId === undefined) return `Unknown item "${p.item}".`;

        const tableId = bot.registry.blocksByName.crafting_table?.id;
        const tableBlock =
          tableId !== undefined
            ? bot.findBlock({ matching: tableId, maxDistance: 4 })
            : null;

        const recipes = bot.recipesFor(itemId, null, 1, tableBlock ?? null);
        if (!recipes.length) {
          const need = tableBlock ? "" : " (a crafting table may be required nearby)";
          return `No available recipe for "${p.item}" with current materials${need}.`;
        }
        await bot.craft(recipes[0]!, p.count ?? 1, tableBlock ?? undefined);
        return `Crafted ${p.count ?? 1}x ${p.item}.`;
      }),
  }),

  defineTool({
    name: "equip",
    label: "Equip",
    description: "Equip an item from inventory to a destination slot.",
    parameters: Type.Object({
      item: Type.String(),
      destination: Type.Optional(
        Type.Union(
          [
            Type.Literal("hand"),
            Type.Literal("head"),
            Type.Literal("torso"),
            Type.Literal("legs"),
            Type.Literal("feet"),
            Type.Literal("off-hand"),
          ],
          { description: "Default hand." },
        ),
      ),
    }),
    execute: (_id, p) =>
      guard("equip", async () => {
        const item = bot.inventory.items().find((i) => i.name === p.item);
        if (!item) return `No ${p.item} in inventory.`;
        await bot.equip(item, p.destination ?? "hand");
        return `Equipped ${p.item} to ${p.destination ?? "hand"}.`;
      }),
  }),

  defineTool({
    name: "toss",
    label: "Toss item",
    description: "Drop a quantity of an item on the ground.",
    parameters: Type.Object({
      item: Type.String(),
      count: Type.Optional(Type.Number({ description: "Default: all of it." })),
    }),
    execute: (_id, p) =>
      guard("toss", async () => {
        const item = bot.inventory.items().find((i) => i.name === p.item);
        if (!item) return `No ${p.item} in inventory.`;
        await bot.toss(item.type, null, p.count ?? item.count);
        return `Tossed ${p.count ?? item.count}x ${p.item}.`;
      }),
  }),
];
