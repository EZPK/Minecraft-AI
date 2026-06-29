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

### `place_torch` — Light up dark areas
Places a torch next to the bot when it's underground or the light is low (mobs
spawn at light ≤ 7), so you don't get ambushed while mining. Crafts torches from
coal/charcoal + sticks if you're out. Safe to call repeatedly — it no-ops when
it's already bright enough.

```js
run_skill("place_torch", {
  force: false,     // true = place even if it's bright
  threshold: 7,     // place when block light ≤ this (default 7)
})
// → { placed, light, at?: {x,y,z}, reason? }
```

Call it every several blocks while mining/digging underground. Keep some coal and
sticks on hand so it can resupply itself.

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
place_torch {}                            ← light the bottom of the shaft
gather_resource { block: "iron_ore", count: 8, max_radius: 32 }
```

Re-run `place_torch {}` every few blocks as you tunnel so dark gaps don't spawn mobs.
Then smelt using the `furnace` block nearby or craft a furnace first.

### Feed yourself

```
scan_surroundings {}                    ← check what food/animals are nearby
gather_food { count: 3 }               ← if no food in inventory
```
Then eat with `run_skill eat_food {}` or ask the player if you should eat.

### Survey before starting any task

Always call `scan_surroundings` when you've just spawned or been reconnected — it
gives you inventory, health, and what's nearby in one go.

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
| `bot` | Bot mineflayer brut — full API pour tout ce qui n'est pas couvert ci-dessous. Toujours préférer les méthodes ci-dessous. |
| `goto(x, y, z, range?)` | Marcher vers des coordonnées ; stuck-detection automatique |
| `gotoPlayer(name, range?)` | Marcher vers un joueur visible |
| `findBlocks(name, count?, radius?)` | Coordonnées des blocs correspondants → `Vec3[]` |
| `collectBlock(name, count?, radius?)` | Aller, creuser et collecter → nombre réel |
| `place(name, x, y, z)` | Poser un bloc contre un bloc solide adjacent |
| `craft(name, count?)` | Crafter (utilise la table de craft à portée si disponible) |
| `equip(name)` | Équiper un item en main principale |
| `dig(x, y, z)` | Creuser le bloc aux coordonnées données → `true` si creusé |
| `lookAt(x, y, z)` | Regarder vers un point |
| `findEntities(name?, radius?)` | Entités proches → `Entity[]` (triées par distance) |
| `attack(entity)` | Attaquer une entité (obtenue via `findEntities`) |
| `status()` | Snapshot vitaux → `{ health, food, saturation, experience, position }` |
| `inventory()` | Counts items → `Record<string, number>` |
| `say(text)` | Parler dans le chat en cours de skill |
| `log(text)` | Enregistrer une progression (terminal + retourné à l'agent) |
| `wait(ms)` | Attendre ms millisecondes (annulé proprement si timeout) |
| `aborted` | `true` si le skill a été annulé (timeout 120 s) |
| `throwIfAborted()` | Throw si annulé — utiliser dans les boucles longues |

**Key rules:**
- Utiliser `skills.dig()` et non `skills.bot.dig()` — la méthode SkillApi force le regard (`forceLook`), indispensable pour casser le bon bloc.
- Utiliser `skills.place()` et non `skills.bot.placeBlock()` — la méthode SkillApi regarde la face exacte avant de placer.
- Always `skills.log()` progress so the agent and operator can follow along.
- `try/catch` around `skills.goto()` and `skills.dig()` — pathfinding and digging can fail.
- Return a useful value; the agent reads it to decide next steps.
- Skills hot-reload: edit the file and `run_skill` again — no restart needed.
