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
        // Verify the world effect: count items actually picked up, not just
        // blocks dug. collectBlock can dig a block whose drop is then lost
        // (despawn, lava, full inventory) — that's a real failure to surface.
        const invTotal = () =>
          bot.inventory.items().reduce((n, i) => n + i.count, 0);
        const before = invTotal();
        await bot.collectBlock.collect(targets);
        const gained = invTotal() - before;
        if (gained <= 0) {
          throw new Error(
            `dug ${targets.length} ${p.block} but picked up nothing (drops despawned, blocked, or inventory full).`,
          );
        }
        return `Mined ${p.block}: dug ${targets.length}, picked up ${gained} item(s).`;
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
        const before = bot.blockAt(target)?.name ?? "air";
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
        // Verify a block actually appeared: the server can silently reject a
        // placement (occupied, out of reach, anti-cheat). Item name and block
        // name don't always match, so just confirm the cell is no longer the
        // empty space it was.
        const after = bot.blockAt(target)?.name ?? "air";
        if (after === "air" || after === before) {
          throw new Error(
            `placeBlock reported no error but (${p.x}, ${p.y}, ${p.z}) is still "${after}" — placement was rejected.`,
          );
        }
        return `Placed ${p.block} at (${p.x}, ${p.y}, ${p.z}).`;
      }),
  }),
];
