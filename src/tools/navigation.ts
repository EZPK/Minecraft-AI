import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Vec3 } from "vec3";
import pathfinderPkg from "mineflayer-pathfinder";
import { guard, textResult, type ToolFactory } from "./context.js";

const { goals } = pathfinderPkg;

export const navigationTools: ToolFactory = ({ bot }) => [
  defineTool({
    name: "move_to",
    label: "Move to",
    description:
      "Walk to a world coordinate using pathfinding. Returns when the bot arrives or fails to find a path.",
    parameters: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
      z: Type.Number(),
      range: Type.Optional(
        Type.Number({
          description: "How close to get, in blocks. Default 1.",
        }),
      ),
    }),
    execute: (_id, p) =>
      guard("move_to", async () => {
        const gotoPromise = bot.pathfinder.goto(
          new goals.GoalNear(p.x, p.y, p.z, p.range ?? 1),
        );
        gotoPromise.catch(() => {});
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            bot.pathfinder.stop();
            reject(new Error("move_to timed out after 30s"));
          }, 30_000);
        });
        try {
          await Promise.race([gotoPromise, timeoutPromise]);
        } finally {
          clearTimeout(timeoutId);
        }
        // Verify we actually got there: goto can resolve while the bot is stuck
        // short of the goal. Tolerate the requested range plus a little slack.
        const pos = bot.entity.position;
        const range = p.range ?? 1;
        const dist = pos.distanceTo(new Vec3(p.x, p.y, p.z));
        if (dist > range + 1.5) {
          throw new Error(
            `ended ${dist.toFixed(1)} blocks from (${p.x}, ${p.y}, ${p.z}) (wanted within ${range}); path likely blocked.`,
          );
        }
        return `Arrived near (${p.x}, ${p.y}, ${p.z}). Now at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}).`;
      }),
  }),

  defineTool({
    name: "go_to_player",
    label: "Go to player",
    description: "Walk to within a few blocks of a named player.",
    parameters: Type.Object({
      player: Type.String({ description: "In-game name of the player." }),
      range: Type.Optional(Type.Number({ description: "Default 2." })),
    }),
    execute: (_id, p) =>
      guard("go_to_player", async () => {
        const target = bot.players[p.player]?.entity;
        if (!target) {
          return `Player "${p.player}" is not visible (not loaded near the bot).`;
        }
        const { x, y, z } = target.position;
        const range = p.range ?? 2;
        const gotoPromise = bot.pathfinder.goto(
          new goals.GoalNear(x, y, z, range),
        );
        gotoPromise.catch(() => {});
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            bot.pathfinder.stop();
            reject(new Error("go_to_player timed out after 30s"));
          }, 30_000);
        });
        try {
          await Promise.race([gotoPromise, timeoutPromise]);
        } finally {
          clearTimeout(timeoutId);
        }
        // The player may have moved while we pathed; check we ended up close to
        // wherever they are now, not just the stale target position.
        const liveTarget = bot.players[p.player]?.entity;
        const dist = liveTarget
          ? bot.entity.position.distanceTo(liveTarget.position)
          : bot.entity.position.distanceTo(new Vec3(x, y, z));
        if (dist > range + 2.5) {
          throw new Error(
            `ended ${dist.toFixed(1)} blocks from ${p.player} (wanted within ${range}); they may have moved or the path was blocked.`,
          );
        }
        return `Reached ${p.player} (${dist.toFixed(1)} blocks away).`;
      }),
  }),

  defineTool({
    name: "follow_player",
    label: "Follow player",
    description:
      "Continuously follow a player until told to stop (call stop_moving).",
    parameters: Type.Object({
      player: Type.String(),
      distance: Type.Optional(Type.Number({ description: "Default 3." })),
    }),
    execute: (_id, p) =>
      guard("follow_player", async () => {
        const target = bot.players[p.player]?.entity;
        if (!target) return `Player "${p.player}" is not visible.`;
        bot.pathfinder.setGoal(
          new goals.GoalFollow(target, p.distance ?? 3),
          true,
        );
        const onLeft = (player: { username: string }) => {
          if (player.username === p.player) {
            bot.pathfinder.setGoal(null);
            bot.off("playerLeft", onLeft);
          }
        };
        bot.on("playerLeft", onLeft);
        return `Now following ${p.player}.`;
      }),
  }),

  defineTool({
    name: "stop_moving",
    label: "Stop moving",
    description: "Cancel any active pathfinding goal (movement/following).",
    parameters: Type.Object({}),
    execute: () => {
      bot.pathfinder.setGoal(null);
      return Promise.resolve(textResult("Stopped."));
    },
  }),
];
