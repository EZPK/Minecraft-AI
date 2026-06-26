import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Vec3 } from "vec3";
import { guard, type ToolFactory } from "./context.js";

const FACES: Vec3[] = [
  new Vec3(0, 1, 0),
  new Vec3(0, -1, 0),
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
];

export const worldTools: ToolFactory = ({ bot }) => [
  defineTool({
    name: "mine",
    label: "Mine blocks",
    description:
      "Find, walk to, dig and pick up the nearest blocks of a type. Handles pathing and collection.",
    parameters: Type.Object({
      block: Type.String({ description: 'e.g. "oak_log", "stone", "coal_ore".' }),
      count: Type.Optional(Type.Number({ description: "How many, default 1." })),
      radius: Type.Optional(Type.Number({ description: "Search radius, default 32." })),
    }),
    execute: (_id, p) =>
      guard("mine", async () => {
        const id = bot.registry.blocksByName[p.block]?.id;
        if (id === undefined) return `Unknown block type "${p.block}".`;
        const want = p.count ?? 1;
        const positions = bot.findBlocks({
          matching: id,
          maxDistance: p.radius ?? 32,
          count: want,
        });
        if (!positions.length) {
          return `No ${p.block} found within ${p.radius ?? 32} blocks.`;
        }
        const targets = positions
          .map((v) => bot.blockAt(v))
          .filter((b): b is NonNullable<typeof b> => b != null);
        await bot.collectBlock.collect(targets);
        return `Mined ${targets.length} ${p.block}.`;
      }),
  }),

  defineTool({
    name: "place_block",
    label: "Place block",
    description:
      "Place a block from the inventory at the given coordinate. Requires an adjacent solid block to place against.",
    parameters: Type.Object({
      block: Type.String({ description: "Item name to place, must be in inventory." }),
      x: Type.Number(),
      y: Type.Number(),
      z: Type.Number(),
    }),
    execute: (_id, p) =>
      guard("place_block", async () => {
        const item = bot.inventory
          .items()
          .find((i) => i.name === p.block);
        if (!item) return `No ${p.block} in inventory.`;

        const target = new Vec3(p.x, p.y, p.z);
        let reference = null;
        let face = null;
        for (const f of FACES) {
          const candidate = bot.blockAt(target.minus(f));
          if (candidate && candidate.boundingBox === "block") {
            reference = candidate;
            face = f;
            break;
          }
        }
        if (!reference || !face) {
          return `Cannot place at (${p.x}, ${p.y}, ${p.z}): no adjacent solid block to place against.`;
        }

        await bot.equip(item, "hand");
        await bot.placeBlock(reference, face);
        return `Placed ${p.block} at (${p.x}, ${p.y}, ${p.z}).`;
      }),
  }),
];
