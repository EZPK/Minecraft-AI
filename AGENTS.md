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
gather_resource { block: "iron_ore", count: 8, max_radius: 32 }
```
Then smelt using the `furnace` block nearby or craft a furnace first.

### Feed yourself

```
scan_surroundings {}                    ← check what food/animals are nearby
gather_food { count: 3 }               ← if no food in inventory
```
Then eat manually: `bot.consume()` or ask the player if you should eat.

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

**Key rules:**
- Always `skills.log()` progress so the agent and operator can follow along.
- `try/catch` around `skills.goto()` and `bot.dig()` — pathfinding and digging can fail.
- Return a useful value; the agent reads it to decide next steps.
- Skills hot-reload: edit the file and `run_skill` again — no restart needed.
