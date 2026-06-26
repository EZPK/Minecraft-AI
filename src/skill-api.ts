import { Vec3 } from "vec3";
import pathfinderPkg from "mineflayer-pathfinder";
import type { Bot } from "./bot.js";
import type { ChatRouter } from "./chat.js";
import { navigateTo } from "./nav.js";
import { sleep } from "./util.js";

const { goals } = pathfinderPkg;

/**
 * The API surface exposed to agent-authored skills. A skill is an async
 * function `(skills, args) => any`. Keep this stable: its shape is documented
 * to the agent in the system prompt, and existing skills depend on it.
 */
export class SkillApi {
  private logs: string[] = [];

  constructor(
    readonly bot: Bot,
    private readonly chat: ChatRouter,
  ) {}

  /** Record a progress line, returned to the agent after the skill finishes. */
  log(message: string): void {
    console.log(`[skill] ${message}`);
    this.logs.push(message);
  }

  getLogs(): string[] {
    return this.logs;
  }

  /** Speak in the in-game chat. */
  say(text: string): void {
    this.chat.say(text);
  }

  async wait(ms: number): Promise<void> {
    await sleep(ms);
  }

  /** Walk to a coordinate. */
  async goto(x: number, y: number, z: number, range = 1): Promise<void> {
    await this.gotoSafe(new goals.GoalNear(x, y, z, range));
  }

  /** Walk to a player by name. Throws if not visible. */
  async gotoPlayer(name: string, range = 2): Promise<void> {
    const target = this.bot.players[name]?.entity;
    if (!target) throw new Error(`Player "${name}" not visible`);
    const { x, y, z } = target.position;
    await this.gotoSafe(new goals.GoalNear(x, y, z, range));
  }

  private async gotoSafe(
    goal: Parameters<typeof this.bot.pathfinder.goto>[0],
  ): Promise<void> {
    await navigateTo(this.bot, goal, { onLog: (m) => this.log(m) });
  }

  /** Coordinates of the nearest matching blocks. */
  findBlocks(name: string, count = 1, radius = 32): Vec3[] {
    const id = this.bot.registry.blocksByName[name]?.id;
    if (id === undefined) throw new Error(`Unknown block "${name}"`);
    return this.bot.findBlocks({ matching: id, maxDistance: radius, count });
  }

  /** Path to, dig and collect the nearest blocks of a type. */
  async collectBlock(name: string, count = 1, radius = 32): Promise<number> {
    const positions = this.findBlocks(name, count, radius);
    const blocks = positions
      .map((v) => this.bot.blockAt(v))
      .filter((b): b is NonNullable<typeof b> => b != null);
    if (!blocks.length) return 0;
    await this.bot.collectBlock.collect(blocks);
    return blocks.length;
  }

  /** Place a block from inventory against an adjacent solid block. */
  async place(name: string, x: number, y: number, z: number): Promise<void> {
    const item = this.bot.inventory.items().find((i) => i.name === name);
    if (!item) throw new Error(`No ${name} in inventory`);
    const target = new Vec3(x, y, z);
    const faces = [
      new Vec3(0, 1, 0),
      new Vec3(0, -1, 0),
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ];
    for (const f of faces) {
      const ref = this.bot.blockAt(target.minus(f));
      if (ref && ref.boundingBox === "block") {
        await this.bot.equip(item, "hand");
        await this.bot.placeBlock(ref, f);
        return;
      }
    }
    throw new Error(`No adjacent solid block to place ${name} against`);
  }

  /** Craft an item, using a nearby crafting table if one is in reach. */
  async craft(name: string, count = 1): Promise<void> {
    const itemId = this.bot.registry.itemsByName[name]?.id;
    if (itemId === undefined) throw new Error(`Unknown item "${name}"`);
    const tableId = this.bot.registry.blocksByName.crafting_table?.id;
    const table =
      tableId !== undefined
        ? this.bot.findBlock({ matching: tableId, maxDistance: 4 })
        : null;
    const recipes = this.bot.recipesFor(itemId, null, 1, table ?? null);
    if (!recipes.length) throw new Error(`No recipe available for "${name}"`);
    await this.bot.craft(recipes[0]!, count, table ?? undefined);
  }

  /** Item counts in the inventory. */
  inventory(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const it of this.bot.inventory.items()) {
      counts[it.name] = (counts[it.name] ?? 0) + it.count;
    }
    return counts;
  }
}

export type Skill = (
  skills: SkillApi,
  args: Record<string, unknown>,
) => Promise<unknown>;
