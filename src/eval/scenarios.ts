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

// ── helpers ──────────────────────────────────────────────────────────────────

/** True if any of the named blocks exists within `radius` of the bot. */
function blocksNearby(bot: Bot, names: readonly string[], radius = 48): boolean {
  for (const name of names) {
    const id = bot.registry.blocksByName[name]?.id;
    if (id === undefined) continue;
    if (bot.findBlocks({ matching: id, maxDistance: radius, count: 1 }).length) return true;
  }
  return false;
}

const WOOD_SOURCES = [...WOOD_LOGS, "oak_planks", "birch_planks", "spruce_planks"];
const STONE_PICKAXES = ["stone_pickaxe", "iron_pickaxe", "diamond_pickaxe"];
const ALL_IRON_ORE = ["iron_ore", "deepslate_iron_ore"];
const COOKED_MEAT = ["cooked_beef", "cooked_porkchop", "cooked_chicken", "cooked_mutton", "cooked_rabbit", "cooked_cod", "cooked_salmon"];
const RAW_MEAT    = ["beef", "porkchop", "chicken", "mutton", "rabbit", "cod", "salmon", "bread", "apple"];
const ANIMALS     = ["cow", "pig", "chicken", "sheep", "rabbit"];

// ── note on anti-faking ──────────────────────────────────────────────────────
// Every goalPrompt includes:
// 1. A precise terminal state (exact items + quantities the fitness will check).
// 2. Explicit step list so the bot can't stop after one step and declare success.
// 3. A reminder that the fitness function reads the REAL inventory — claiming
//    success without the items gives the same score as doing nothing.

// ── scenario 1 — wood kit ─────────────────────────────────────────────────────

/**
 * Full beginner wood-gathering cycle: chop trees, make planks, craft a table
 * and a wooden pickaxe. Tests the complete first-tier progression.
 */
const woodKit: Scenario = {
  id: "wood_kit",
  goalPrompt: `\
OBJECTIF : constitue un kit bois complet avant toute autre action.

Étapes obligatoires (dans l'ordre) :
1. Trouve des arbres avec scan_surroundings ou find_blocks.
2. Coupe au moins 12 bûches (mine ou collectBlock). Vérifie avec inventory().
3. Fabrique des planches : craft("oak_planks", 48) ou équivalent pour ton type de bois.
4. Fabrique des bâtons : craft("stick", 16).
5. Pose une table de craft : place("crafting_table", …) ou craft puis pose.
6. Fabrique une hache en bois (wooden_axe) et une pioche en bois (wooden_pickaxe).

ÉTAT FINAL REQUIS dans l'inventaire :
- logs (n'importe quel type) ≥ 4 restants OU planches ≥ 16
- crafting_table ≥ 1
- wooden_pickaxe ≥ 1
- wooden_axe ≥ 1

IMPORTANT : la fitness lit ton inventaire réel à la fin de l'épisode.
Dire "j'ai terminé" sans les items donne le même score que ne rien faire.
Ne termine ton tour QUE quand tu as vérifié chaque item avec inventory().`,
  timeoutMs: 240_000,
  precondition: (bot) =>
    blocksNearby(bot, WOOD_LOGS) ? null : "no trees within 48 blocks",
  fitness: (before, after, tel) => {
    const logs  = gainAny(before, after, WOOD_LOGS);
    const planks = Math.max(0,
      gainAny(before, after, ["oak_planks", "birch_planks", "spruce_planks",
        "jungle_planks", "acacia_planks", "dark_oak_planks"]) / 4);
    const woodProgress = logs + planks;
    const hasTable   = (after.inventory["crafting_table"] ?? 0) > 0 ? 4 : 0;
    const hasPickaxe = (after.inventory["wooden_pickaxe"] ?? 0) > 0 ? 4 : 0;
    const hasAxe     = (after.inventory["wooden_axe"] ?? 0) > 0 ? 3 : 0;
    const allDone    = hasTable > 0 && hasPickaxe > 0 && hasAxe > 0 && woodProgress >= 4 ? 6 : 0;
    return compose(
      {
        wood:     Math.min(woodProgress, 12),
        table:    hasTable,
        pickaxe:  hasPickaxe,
        axe:      hasAxe,
        allDone,
        techTree: distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

// ── scenario 2 — stone tools ─────────────────────────────────────────────────

/**
 * Craft a stone pickaxe and stone axe. Requires the full chain:
 * wood → crafting table → wooden pickaxe → mine cobblestone → stone tools.
 */
const stoneTools: Scenario = {
  id: "stone_tools",
  goalPrompt: `\
OBJECTIF : fabrique une pioche en pierre et une hache en pierre.

Chaîne complète requise :
1. Assure-toi d'avoir une pioche en bois (craft si besoin).
2. Mine au moins 16 cobblestone avec la pioche en bois.
3. Fabrique une pioche en pierre (stone_pickaxe) et une hache en pierre (stone_axe)
   sur une table de craft.
4. Vérifie l'inventaire avec inventory() avant de déclarer succès.

ÉTAT FINAL REQUIS :
- stone_pickaxe ≥ 1
- stone_axe ≥ 1
- cobblestone ≥ 4 restants

IMPORTANT : la fitness mesure l'inventaire réel. Chaque étape doit être exécutée —
avoir les items en chat ne suffit pas, ils doivent être dans l'inventaire.`,
  timeoutMs: 300_000,
  precondition: (bot, before) => {
    const hasWoodSrc = hasAny(before, WOOD_SOURCES);
    const hasStone   = blocksNearby(bot, ["stone", "cobblestone"]);
    if (!hasWoodSrc && !blocksNearby(bot, WOOD_LOGS)) return "no wood available";
    if (!hasStone)                                     return "no stone within 48 blocks";
    return null;
  },
  fitness: (before, after, tel) => {
    const cobble      = gain(before, after, "cobblestone");
    const stonePickaxe = (after.inventory["stone_pickaxe"] ?? 0) > 0 ? 8 : 0;
    const stoneAxe     = (after.inventory["stone_axe"] ?? 0) > 0 ? 6 : 0;
    const bothDone     = stonePickaxe > 0 && stoneAxe > 0 ? 8 : 0;
    return compose(
      {
        cobblestone:  Math.min(Math.max(cobble, 0), 12),
        stone_pickaxe: stonePickaxe,
        stone_axe:     stoneAxe,
        bothDone,
        techTree:      distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

// ── scenario 3 — iron pipeline ───────────────────────────────────────────────

/**
 * Full iron tech-tree: find ore → mine with stone pickaxe → smelt in furnace →
 * hold iron ingots. Tests multi-stage planning and tool-tier awareness.
 */
const ironPipeline: Scenario = {
  id: "iron_pipeline",
  goalPrompt: `\
OBJECTIF : obtiens 4 lingots de fer (iron_ingot) dans ton inventaire.

Chaîne complète (chaque étape est obligatoire) :
1. Vérifie que tu as au moins une stone_pickaxe (ou mieux). Si non, fabrique-en une.
2. Trouve du minerai de fer (iron_ore ou deepslate_iron_ore) avec find_blocks.
3. Mine au moins 6 blocs de minerai de fer. Ramasse tout.
4. Fabrique ou trouve un fourneau (furnace). Place-le.
5. Mets du bois/charbon comme combustible et le minerai de fer dedans.
6. Smelt jusqu'à avoir ≥ 4 iron_ingot. Récupère les lingots.
7. Vérifie avec inventory() que tu as bien iron_ingot ≥ 4.

ÉTAT FINAL REQUIS :
- iron_ingot ≥ 4

RAPPEL CRITIQUE : la fitness lit l'inventaire réel. Si le minerai n'est pas fondu
et les lingots pas dans l'inventaire, le score est 0. Ne t'arrête pas avant d'avoir
vérifié.`,
  timeoutMs: 480_000,
  precondition: (bot, before) => {
    if (!hasAny(before, STONE_PICKAXES) &&
        !blocksNearby(bot, WOOD_LOGS) &&
        !hasAny(before, WOOD_SOURCES)) return "no way to craft stone pickaxe";
    if (!blocksNearby(bot, ALL_IRON_ORE, 64)) return "no iron ore within 64 blocks";
    return null;
  },
  fitness: (before, after, tel) => {
    const rawIron    = gain(before, after, "raw_iron");
    const ironIngots = gain(before, after, "iron_ingot");
    const hasFurnace = (after.inventory["furnace"] ?? 0) > 0 ||
                       gain(before, after, "furnace") > 0 ? 3 : 0;
    return compose(
      {
        raw_iron:    Math.min(Math.max(rawIron, 0), 6) * 1.5,
        furnace:     hasFurnace,
        iron_ingot:  Math.min(Math.max(ironIngots, 0), 8) * 3,
        goal:        ironIngots >= 4 ? 10 : 0,
        techTree:    distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

// ── scenario 4 — food supply ─────────────────────────────────────────────────

/**
 * Secure a food supply: hunt/cook meat or harvest crops. Tests foraging and
 * the cooking pipeline.
 */
const foodSupply: Scenario = {
  id: "food_supply",
  goalPrompt: `\
OBJECTIF : avoir 6 unités de nourriture cuite ou prête à manger dans l'inventaire.

Méthodes possibles (choisis la plus réalisable selon l'environnement) :
Option A — Chasse :
  1. Trouve des animaux (vache, cochon, poulet, mouton) avec scan_surroundings ou find_blocks.
  2. Tue-les (attack après goto).
  3. Récupère la viande crue.
  4. Fabrique ou trouve un fourneau, fais cuire la viande.
  5. Récupère la viande cuite.

Option B — Récolte (si cultures visibles) :
  1. Trouve des blocs wheat/carrot/potato mûrs.
  2. Récolte-les (harvest_crops ou dig).
  3. Le pain (bread) nécessite 3 blés sur une table de craft.

ÉTAT FINAL REQUIS :
- Au moins 6 items de nourriture (cooked_beef / cooked_porkchop / cooked_chicken /
  cooked_mutton / bread / apple / carrot / baked_potato / cookie…) dans l'inventaire.

IMPORTANT : la fitness compte les items réels dans l'inventaire. "J'ai trouvé des
animaux" sans les tuer et cuire ne donne aucun point. Termine chaque étape.`,
  timeoutMs: 360_000,
  precondition: (bot, before) => {
    const hasAnimals = blocksNearby(bot, ANIMALS as unknown as string[], 64);
    const hasCrops   = blocksNearby(bot, ["wheat", "carrots", "potatoes", "beetroots"], 48);
    const hasFood    = hasAny(before, [...COOKED_MEAT, "bread", "apple", "carrot"]);
    if (!hasAnimals && !hasCrops && !hasFood) return "no food sources within range";
    return null;
  },
  fitness: (before, after, tel) => {
    const ALL_FOOD = [...COOKED_MEAT, "bread", "apple", "carrot", "baked_potato",
                      "cookie", "pumpkin_pie", "golden_carrot"];
    const rawGain  = gainAny(before, after, RAW_MEAT);
    const foodGain = gainAny(before, after, ALL_FOOD);
    return compose(
      {
        raw_food:   Math.min(rawGain, 6),
        cooked_food: Math.min(foodGain, 10) * 2,
        goal:       foodGain >= 6 ? 10 : foodGain >= 3 ? 4 : 0,
        techTree:   distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

// ── scenario 5 — survive and scout ──────────────────────────────────────────

/**
 * Survive while actively gathering information. Rewards staying alive AND
 * exploring (new block types discovered = scouting progress).
 */
const surviveAndScout: Scenario = {
  id: "survive_and_scout",
  goalPrompt: `\
OBJECTIF : rester en vie ET explorer activement pendant 3 minutes.

Tâches simultanées :
1. Surveille ta santé et ta faim avec status() régulièrement.
2. Si la faim descend sous 14, mange (eat_food ou equip+consume).
3. Fuis ou combat les mobs hostiles.
4. Explore : déplace-toi pour découvrir de nouveaux types de blocs (mine ou
   scan_surroundings toutes les 30 secondes pour cartographier l'environnement).
5. Récupère des matériaux utiles au passage (bois, pierre, nourriture).

ÉTAT FINAL REQUIS :
- Être en vie (health > 0) à la fin
- Santé ≥ 14/20
- Avoir découvert au moins 3 nouveaux types d'items

PIÈGE À ÉVITER : rester immobile. L'exploration active est récompensée.`,
  timeoutMs: 240_000,
  fitness: (before, after, tel) =>
    compose(
      {
        survived:  tel.deaths === 0 ? 8 : 0,
        health:    Math.max(0, after.health - 10) * 0.5,
        food:      after.food >= 14 ? 3 : 0,
        scouting:  Math.min(distinctNewTypes(before, after), 8) * 1.5,
        items:     Math.min(gainAny(before, after, [...WOOD_LOGS, "cobblestone",
                     "coal", "gravel", "sand", "dirt"]), 10) * 0.5,
      },
      tel,
    ),
};

// ── scenario 6 — coal & torch ────────────────────────────────────────────────

/**
 * Mine coal and make torches. Tests underground navigation and light management.
 */
const coalAndTorches: Scenario = {
  id: "coal_and_torches",
  goalPrompt: `\
OBJECTIF : mine du charbon et fabrique des torches.

Étapes :
1. Trouve du coal_ore avec find_blocks (radius 48).
2. Assure-toi d'avoir une pioche (wooden ou mieux). Si non, fabrique-en une.
3. Mine au moins 8 blocs de charbon (coal_ore).
4. Ramasse le coal obtenu.
5. Sur une table de craft, fabrique au moins 16 torches (torch) :
   recette = 1 coal + 1 stick → 4 torches.
6. Vérifie avec inventory() : coal ≥ 2 restants ET torch ≥ 16.

ÉTAT FINAL REQUIS :
- coal ≥ 2
- torch ≥ 16

La fitness compte les vrais items. "J'ai cherché du charbon" sans les torches = 0.`,
  timeoutMs: 300_000,
  precondition: (bot, before) => {
    if (!blocksNearby(bot, ["coal_ore", "deepslate_coal_ore"])) return "no coal ore within 48 blocks";
    if (!hasAny(before, WOOD_SOURCES) && !blocksNearby(bot, WOOD_LOGS)) return "no wood for tools";
    return null;
  },
  fitness: (before, after, tel) => {
    const coal    = gain(before, after, "coal");
    const torches = gain(before, after, "torch");
    return compose(
      {
        coal:    Math.min(Math.max(coal, 0), 12) * 1.5,
        torches: Math.min(Math.max(torches, 0), 32),
        goal:    torches >= 16 ? 10 : torches >= 8 ? 4 : 0,
        techTree: distinctNewTypes(before, after),
      },
      tel,
    );
  },
};

// ── exports ───────────────────────────────────────────────────────────────────

export const SCENARIOS: Scenario[] = [
  woodKit,
  stoneTools,
  ironPipeline,
  foodSupply,
  surviveAndScout,
  coalAndTorches,
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
