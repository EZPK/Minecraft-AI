import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import pathfinderPkg from "mineflayer-pathfinder";
import { guard, type ToolFactory } from "./context.js";

const { goals } = pathfinderPkg;

const HOSTILE = new Set([
  "zombie",
  "skeleton",
  "spider",
  "creeper",
  "enderman",
  "witch",
  "husk",
  "drowned",
  "pillager",
  "zombified_piglin",
  "slime",
]);

export const combatTools: ToolFactory = ({ bot }) => [
  defineTool({
    name: "attack",
    label: "Attack",
    description:
      "Attack the nearest hostile mob, or a specific entity type if named. Approaches and hits once.",
    parameters: Type.Object({
      target: Type.Optional(
        Type.String({
          description: 'Entity type to attack, e.g. "zombie". Omit to attack nearest hostile.',
        }),
      ),
    }),
    execute: (_id, p) =>
      guard("attack", async () => {
        const origin = bot.entity.position;
        const candidate = Object.values(bot.entities)
          .filter((e) => {
            if (e === bot.entity) return false;
            const name = e.name ?? "";
            return p.target ? name === p.target : HOSTILE.has(name);
          })
          .map((e) => ({ e, d: e.position.distanceTo(origin) }))
          .sort((a, b) => a.d - b.d)[0];

        if (!candidate) {
          return p.target
            ? `No ${p.target} nearby.`
            : "No hostile mobs nearby.";
        }

        const { e } = candidate;
        if (candidate.d > 3) {
          const { x, y, z } = e.position;
          const gotoPromise = bot.pathfinder.goto(new goals.GoalNear(x, y, z, 2));
          gotoPromise.catch(() => {});
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              bot.pathfinder.stop();
              reject(new Error("approach timed out after 30s"));
            }, 30_000);
          });
          try {
            await Promise.race([gotoPromise, timeoutPromise]);
          } finally {
            clearTimeout(timeoutId);
          }
        }
        await bot.lookAt(e.position.offset(0, e.height * 0.5, 0));
        bot.attack(e);
        return `Attacked ${e.name ?? e.type}.`;
      }),
  }),
];
