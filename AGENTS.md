# Minecraft Agent — Skills Library

This file is your reference for the pre-built skill library. Use `list_skills` to
confirm what's on disk; the descriptions below explain *when* and *how* to use each.

---

## When to use a skill vs a direct tool

| Use **direct tools** when… | Use **a skill** when… |
|---|---|
| Single action (move, place one block, check inventory) | Multi-step task (gather 32 logs, harvest the farm) |
| You need the result immediately in the same turn | The task loops or has error-recovery logic |
| The action is simple enough to inline | The task is worth reusing later |

> **Ask the expert first — obligatoire.** Avant de commencer toute tâche
> impliquant du craft, du minage, de la construction, de l'agriculture ou un
> objectif multi-étapes, tu **DOIS** appeler `ask_minecraft_expert`. Pose-lui :
> la recette exacte et les matériaux requis, l'ordre du tech-tree (qu'est-ce
> qu'il faut construire en premier ?), et la méthode optimale. Fais-le même si
> tu penses connaître la réponse. N'agis qu'après avoir reçu la réponse. Deviner
> et agir à l'aveugle est une erreur ; l'appel expert est rapide et gratuit.
> (Disponible seulement si un modèle Minecraft local est configuré.)
>
> **Remember across sessions.** You start amnesiac on every reconnect. Use
> `remember` to save durable facts (base/home coords, chest & resource-site
> locations, current objective, lessons learned) and `recall` to read them back.

---

## Pre-built skills

### `gather_resource` — Universal block collector
Collects any block type. Automatically expands the search radius if not enough is
found close by.

```js
run_skill("gather_resource", {
  block: "oak_log",     // required — Minecraft block name
  count: 16,            // default 1
  max_radius: 128,      // default 128 (blocks)
})
// → { collected, requested, block }
```

Use this for wood, stone, gravel, sand, dirt, coal_ore, etc. For ore underground,
combine with `dig_shaft` first.

---

### `gather_food` — Hunt passive animals
Finds, approaches, and kills passive animals. Waits for drops; Minecraft auto-pickup
collects them.

```js
run_skill("gather_food", {
  count: 3,                           // animals to kill (default 3)
  animals: ["cow", "pig"],            // optional whitelist (default: all passive)
})
// → { killed, food: { raw_beef: 2, … } }
```

Animals: `cow`, `pig`, `sheep`, `chicken`, `rabbit`.

---

### `dig_shaft` — Dig straight down
Digs a 1×1 vertical shaft from current position to a target Y level. Stops
automatically on lava.

```js
run_skill("dig_shaft", {
  target_y: 12,   // absolute Y to reach (OR use depth)
  depth: 20,      // relative: dig 20 blocks below current Y
})
// → { dug, start_y, end_y }
```

Good for reaching mining depth quickly. **Note:** creates a hole — use ladders or
make a staircase separately to come back up.

---

### `scan_surroundings` — Situational awareness
Returns a structured snapshot of position, health, inventory, nearby entities, and
nearby blocks of interest. Use this to orient yourself before planning a task.

```js
run_skill("scan_surroundings", {
  radius: 32,   // default 32
})
// → { status: { position, health, food, … }, entities: […], nearby_blocks: { oak_log: 4, … }, inventory: {…} }
```

---

### `equip_best_tool` — Auto-equip optimal tool
Equips the highest-tier tool for a given activity from your inventory.

```js
run_skill("equip_best_tool", {
  activity: "mining",   // "mining" | "woodcutting" | "combat" | "digging" | "farming"
})
// → { equipped: "iron_pickaxe", activity }
```

Call this before mining, chopping, or fighting so you use the right tool.

---

### `harvest_crops` — Farm automation
Harvests mature wheat, carrots, potatoes, and beetroots in a radius. Replants
automatically if seeds are in inventory.

```js
run_skill("harvest_crops", {
  radius: 16,       // default 16
  replant: true,    // default true
})
// → { harvested, replanted }
```

---

### `mine_iron_vein` — Mine nearby iron ore
Finds and mines iron ore and deepslate iron ore within radius. Auto-equips the best
pickaxe available.

```js
run_skill("mine_iron_vein", {
  count: 8,      // default 8
  radius: 32,    // default 32
})
// → { mined, requested }
```

Use `dig_shaft` first to reach Y=16 (iron level), then call this.

---

### `smelt_in_furnace` — Smelt items
Navigates to the nearest furnace, loads input + fuel, waits for output, then
reclaims any leftover input and fuel.

```js
run_skill("smelt_in_furnace", {
  input: "raw_iron",   // required — item to smelt
  fuel: "coal",        // default "coal"
  count: 8,            // default 1
})
// → { smelted, output }
```

---

### `empty_furnace` — Empty a furnace
Retrieves output, input, and fuel from the nearest furnace into inventory.

```js
run_skill("empty_furnace", {})
// → {}
```

---

### `eat_food` — Eat the held item
Activates (right-click) whatever is currently held in hand. Equip food first.

```js
run_skill("eat_food", {})
// → { ate: "cooked_beef" }
```

---

### `eat_specific_food` — Equip and eat a food item
Finds a specific food in inventory, equips it, and eats it.

```js
run_skill("eat_specific_food", {
  item: "cooked_chicken",   // default "cooked_chicken"
})
// → { ate, health, food }
```

---

### `break_grass_for_seeds` — Collect wheat seeds
Breaks nearby short/tall grass to collect wheat seeds. Navigates to each patch.

```js
run_skill("break_grass_for_seeds", {
  radius: 8,    // default 8
  count: 10,    // target seed count to stop early (default 10)
})
// → { broken, seeds }
```

---

### `craft_at_table` — Craft using a crafting table
Crafts an item using a crafting table within 4 blocks. The table must already be
placed in the world.

```js
run_skill("craft_at_table", {
  item: "oak_planks",   // required — Minecraft item name
  count: 8,             // default 1
})
// → { crafted, count }
```

---

### `place_crafting` — Place a crafting table
Places a crafting table from inventory at the bot's feet using the block below as a
reference. Stops pathfinder first to avoid movement conflicts.

```js
run_skill("place_crafting", {})
// → { placed: true, at: { x, y, z } }
```

---

### `place_door` — Place a door
Places an oak door in front of the bot (bottom block position).

```js
run_skill("place_door", {})
// → true | false
```

---

### `dig_nearby` — Dig blocks without pathfinding
Digs blocks of a given type within reach (≤5 blocks) without using the pathfinder.
Useful as a fallback when pathfinding fails.

```js
run_skill("dig_nearby", {
  block: "stone",   // required
  count: 1,         // default 1
  radius: 10,       // search radius (default 10)
})
// → count of blocks dug
```

---

### `build_house` — Build a wooden house
Clears the footprint, then builds floor, walls, roof, and optionally a door at the
current position. Size and material are configurable.

```js
run_skill("build_house", {
  width: 7,              // default 7
  depth: 5,              // default 5
  wall_height: 3,        // default 3
  block: "oak_planks",   // default "oak_planks"
})
// → { origin: { x, y, z }, width, depth, placed }
```

Gather enough planks before calling (a 7×5 house needs ~160 blocks). Have a door
item in inventory for automatic door placement.

---

## Common task recipes

### Get wood → make planks → make sticks/crafting table

```
equip_best_tool { activity: "woodcutting" }
gather_resource { block: "oak_log", count: 8 }
craft { name: "oak_planks", count: 32 }   ← use the craft tool
```

### Mine iron

```
equip_best_tool { activity: "mining" }
dig_shaft { target_y: 16 }
mine_iron_vein { count: 8 }
```
Then smelt: place a furnace nearby, run `smelt_in_furnace { input: "raw_iron", fuel: "coal", count: 8 }`.

### Feed yourself

```
scan_surroundings {}                         ← check what food/animals are nearby
gather_food { count: 3 }                     ← if no food in inventory
eat_specific_food { item: "raw_beef" }       ← or any food you have
```

### Survey before starting any task

When you've just spawned or been reconnected: **`recall` your memory first** (to
know your base, objective, and past lessons), then call `scan_surroundings` — it
gives you inventory, health, and what's nearby in one go.

### Build a shelter

```
gather_resource { block: "oak_log", count: 16 }
craft { name: "oak_planks", count: 64 }
craft { name: "oak_door", count: 1 }
build_house {}
```

---

## Writing new skills — quick reference

```js
/** One-line JSDoc description — shown in list_skills */
export default async function (skills, args) {
  const count = args.count ?? 1;      // always default your args
  skills.log("progress message");      // visible in terminal AND returned to agent
  const got = await skills.collectBlock("oak_log", count, 32);
  return { got };                      // return a plain object or primitive
}
```

**SkillApi reference (`skills.*`) :**

| Méthode | Description |
|---|---|
| `bot` | Bot mineflayer brut — full API pour tout ce qui n'est pas couvert ci-dessous |
| `goto(x, y, z, range?)` | Marcher vers des coordonnées ; timeout 60 s, détection de blocage |
| `gotoPlayer(name, range?)` | Marcher vers un joueur ; throw si non visible |
| `findBlocks(name, count?, radius?)` | Coordonnées des blocs correspondants → `Vec3[]` |
| `collectBlock(name, count?, radius?)` | Aller, creuser et collecter → count réel |
| `place(name, x, y, z)` | Poser un bloc de l'inventaire contre un bloc solide adjacent |
| `craft(name, count?)` | Crafter ; utilise la table de craft à portée si disponible |
| `equip(name)` | Équiper un item de l'inventaire en main principale |
| `dig(x, y, z)` | Creuser le bloc aux coordonnées données → `true` si creusé |
| `lookAt(x, y, z)` | Faire pivoter la vue vers un point |
| `findEntities(name?, radius?)` | Entités proches triées par distance → `Entity[]` |
| `attack(entity)` | Attaquer une entité (obtenue via `findEntities`) |
| `status()` | Snapshot des vitaux → `{ health, food, saturation, experience, position }` |
| `inventory()` | Counts des items → `Record<string, number>` |
| `say(text)` | Parler dans le chat en cours de skill |
| `log(text)` | Enregistrer une progression (terminal + retourné à l'agent) |
| `wait(ms)` | Attendre `ms` millisecondes |

**Key rules:**
- Always `skills.log()` progress so the agent and operator can follow along.
- `try/catch` around `skills.goto()` and `bot.dig()` — pathfinding and digging can fail.
- Return a useful value; the agent reads it to decide next steps.
- Skills hot-reload: edit the file and `run_skill` again — no restart needed.
