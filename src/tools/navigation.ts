import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import pathfinderPkg from "mineflayer-pathfinder";
import { guard, textResult, type ToolFactory } from "./context.js";
import { navigateTo } from "../nav.js";

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
        await navigateTo(bot, new goals.GoalNear(p.x, p.y, p.z, p.range ?? 1));
        const pos = bot.entity.position;
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
        await navigateTo(bot, new goals.GoalNear(x, y, z, p.range ?? 2));
        return `Reached ${p.player}.`;
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
