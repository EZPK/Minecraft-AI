import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { guard, type ToolFactory } from "./context.js";

export const perceptionTools: ToolFactory = ({ bot }) => [
  defineTool({
    name: "status",
    label: "Status",
    description:
      "Report the bot's current state: position, health, food, held item, dimension, time of day.",
    parameters: Type.Object({}),
    execute: () =>
      guard("status", async () => {
        const p = bot.entity.position;
        const held = bot.heldItem ? bot.heldItem.name : "nothing";
        return [
          `Position: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`,
          `Health: ${bot.health}/20  Food: ${bot.food}/20`,
          `Holding: ${held}`,
          `Dimension: ${bot.game.dimension}`,
          `Game time: ${bot.time.timeOfDay} (day ${bot.time.day})`,
        ].join("\n");
      }),
  }),

  defineTool({
    name: "nearby_entities",
    label: "Nearby entities",
    description:
      "List players, mobs and dropped items near the bot, with distance.",
    parameters: Type.Object({
      radius: Type.Optional(Type.Number({ description: "Default 16 blocks." })),
    }),
    execute: (_id, p) =>
      guard("nearby_entities", async () => {
        const radius = p.radius ?? 16;
        const origin = bot.entity.position;
        const rows = Object.values(bot.entities)
          .filter((e) => e !== bot.entity)
          .map((e) => ({ e, d: e.position.distanceTo(origin) }))
          .filter((r) => r.d <= radius)
          .sort((a, b) => a.d - b.d)
          .slice(0, 25)
          .map(({ e, d }) => {
            const name = e.username ?? e.name ?? e.displayName ?? e.type;
            return `- ${name} (${e.type}) ${d.toFixed(1)}m`;
          });
        return rows.length
          ? rows.join("\n")
          : `No entities within ${radius} blocks.`;
      }),
  }),

  defineTool({
    name: "find_blocks",
    label: "Find blocks",
    description:
      "Search for the nearest blocks of a given type and return their coordinates.",
    parameters: Type.Object({
      block: Type.String({ description: 'Block name, e.g. "oak_log", "iron_ore".' }),
      count: Type.Optional(Type.Number({ description: "Max results, default 5." })),
      radius: Type.Optional(Type.Number({ description: "Search radius, default 32." })),
    }),
    execute: (_id, p) =>
      guard("find_blocks", async () => {
        const id = bot.registry.blocksByName[p.block]?.id;
        if (id === undefined) return `Unknown block type "${p.block}".`;
        const positions = bot.findBlocks({
          matching: id,
          maxDistance: p.radius ?? 32,
          count: p.count ?? 5,
        });
        if (!positions.length) {
          return `No ${p.block} found within ${p.radius ?? 32} blocks.`;
        }
        return positions
          .map((v) => `- (${v.x}, ${v.y}, ${v.z})`)
          .join("\n");
      }),
  }),
];
