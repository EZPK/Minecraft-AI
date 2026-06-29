import type { Bot } from "../bot.js";
import type { Scenario } from "./scenario.js";
import {
  WOOD_LOGS,
  compose,
  distinctNewTypes,
  gain,
  gainAny,
  hasAny,
} from "./fitness.js";

/** True if any of the named blocks exists within `radius` of the bot. */
function blocksNearby(bot: Bot, names: readonly string[], radius = 48): boolean {
  for (const name of names) {
    const id = bot.registry.blocksByName[name]?.id;
    if (id === undefined) continue;
    const found = bot.findBlocks({ matching: id, maxDistance: radius, count: 1 });
    if (found.length) return true;
  }
  return false;
}

const WOOD_SOURCES = [...WOOD_LOGS, "oak_planks", "birch_planks", "spruce_planks"];

/** 1 — gather raw wood. The entry point of every Minecraft run. */
const collectWood: Scenario = {
  id: "collect_wood",
  goalPrompt:
    "Collect at least 5 wood logs of any type. Use your existing skills and tools to find and chop trees.",
  timeoutMs: 180_000,
  precondition: (bot) =>
    blocksNearby(bot, WOOD_LOGS) ? null : "no trees within 48 blocks",
  fitness: (before, after, tel) => {
    const logs = gainAny(before, after, WOOD_LOGS);
    return compose(
      {
        logs: Math.min(logs, 8),
        goal: logs >= 5 ? 5 : 0,
        techTree: distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

/** 2 — first crafting: table + wooden pickaxe (gateway to the tech tree). */
const craftBasics: Scenario = {
  id: "craft_basics",
  goalPrompt:
    "Make a crafting table and a wooden pickaxe. Gather wood first if you need it.",
  timeoutMs: 240_000,
  precondition: (bot, before) =>
    blocksNearby(bot, WOOD_LOGS) || hasAny(before, WOOD_SOURCES)
      ? null
      : "no wood available (none nearby or in inventory)",
  fitness: (before, after, tel) =>
    compose(
      {
        crafting_table: gain(before, after, "crafting_table") > 0 ? 4 : 0,
        wooden_pickaxe: gain(before, after, "wooden_pickaxe") > 0 ? 6 : 0,
        techTree: distinctNewTypes(before, after),
      },
      tel,
    ),
};

/** 3 — mine stone. Tests tool use + digging once wood is solved. */
const mineStone: Scenario = {
  id: "mine_stone",
  goalPrompt:
    "Mine at least 10 stone. Craft a wooden pickaxe first if you don't have one.",
  timeoutMs: 240_000,
  precondition: (bot) =>
    blocksNearby(bot, ["stone"]) ? null : "no stone within 48 blocks",
  fitness: (before, after, tel) => {
    const cobble = gain(before, after, "cobblestone");
    return compose(
      {
        cobblestone: Math.min(cobble, 12),
        goal: cobble >= 10 ? 5 : 0,
        techTree: distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

/** 4 — mine iron. Deeper tech-tree progress; often neutralized if no ore nearby. */
const mineIron: Scenario = {
  id: "mine_iron",
  goalPrompt:
    "Find iron ore, mine it with a stone (or better) pickaxe, and end up with raw iron.",
  timeoutMs: 300_000,
  precondition: (bot) =>
    blocksNearby(bot, ["iron_ore", "deepslate_iron_ore"], 64)
      ? null
      : "no iron ore within 64 blocks",
  fitness: (before, after, tel) => {
    const raw = gain(before, after, "raw_iron");
    return compose(
      {
        raw_iron: Math.min(raw, 5) * 3,
        goal: raw >= 1 ? 5 : 0,
        techTree: distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

/** 5 — stay alive. Pure competence/survival; rewards not dying and keeping HP. */
const surviveNight: Scenario = {
  id: "survive_night",
  goalPrompt:
    "Stay alive and unharmed for the next few minutes. Defend against hostile mobs, eat if hungry, and don't wander into danger (lava, falls, deep water).",
  timeoutMs: 240_000,
  fitness: (before, after, tel) =>
    compose(
      {
        survived: tel.deaths === 0 ? 6 : 0,
        health: (after.health / 20) * 4,
      },
      tel,
    ),
};

export const SCENARIOS: Scenario[] = [
  collectWood,
  craftBasics,
  mineStone,
  mineIron,
  surviveNight,
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
