import { Vec3 } from "vec3";
import pathfinderPkg from "mineflayer-pathfinder";
import type { Entity } from "prismarine-entity";
import type { Bot } from "./bot.js";
import type { ChatRouter } from "./chat.js";

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
    private readonly isAlive: () => boolean = () => true,
  ) {}

  /** Throw if the bot has disconnected, so a running skill bails instead of acting on a dead bot. */
  private ensureAlive(): void {
    if (!this.isAlive()) throw new Error("Bot disconnected — aborting skill.");
  }

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
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Walk to a coordinate. */
  async goto(x: number, y: number, z: number, range = 1): Promise<void> {
    this.ensureAlive();
    await this.gotoSafe(new goals.GoalNear(x, y, z, range));
  }

  /** Walk to a player by name. Throws if not visible. */
  async gotoPlayer(name: string, range = 2): Promise<void> {
    this.ensureAlive();
    const target = this.bot.players[name]?.entity;
    if (!target) throw new Error(`Player "${name}" not visible`);
    const { x, y, z } = target.position;
    await this.gotoSafe(new goals.GoalNear(x, y, z, range));
  }

  // bot.pathfinder.stop() schedules a PathStopped rejection on gotoPromise via
  // setTimeout(0) inside goto.js. gotoPromise.catch(()=>{}) silences that
  // delayed rejection so Node doesn't emit an unhandled rejection warning.
  private async gotoSafe(
    goal: Parameters<typeof this.bot.pathfinder.goto>[0],
  ): Promise<void> {
    const POLL_MS = 2_000;
    const STUCK_LIMIT = 5; // 5 × 2s = 10s sans mouvement → coincé
    const THRESHOLD = 0.5; // blocs minimum entre deux polls
    const TIMEOUT_MS = 60_000;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearInterval(intervalId);
      clearTimeout(timerId);
    };

    const gotoPromise = this.bot.pathfinder.goto(goal);
    gotoPromise.catch(() => {});

    const stuckPromise = new Promise<never>((_, reject) => {
      let lastPos = this.bot.entity.position.clone();
      let stuckCount = 0;
      intervalId = setInterval(() => {
        if (!this.isAlive()) {
          reject(new Error("Bot disconnected — aborting movement."));
          return;
        }
        const cur = this.bot.entity.position;
        if (cur.distanceTo(lastPos) < THRESHOLD) {
          if (++stuckCount >= STUCK_LIMIT)
            reject(
              new Error(
                `Bot coincé: aucun mouvement depuis ${(STUCK_LIMIT * POLL_MS) / 1_000}s`,
              ),
            );
        } else {
          stuckCount = 0;
          lastPos = cur.clone();
        }
      }, POLL_MS);
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(
        () => reject(new Error(`goto timeout après ${TIMEOUT_MS / 1_000}s`)),
        TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([gotoPromise, stuckPromise, timeoutPromise]);
    } catch (err) {
      this.bot.pathfinder.stop();
      throw err;
    } finally {
      cleanup();
    }
  }

  /** Coordinates of the nearest matching blocks. */
  findBlocks(name: string, count = 1, radius = 32): Vec3[] {
    const id = this.bot.registry.blocksByName[name]?.id;
    if (id === undefined) throw new Error(`Unknown block "${name}"`);
    return this.bot.findBlocks({ matching: id, maxDistance: radius, count });
  }

  /** Path to, dig and collect the nearest blocks of a type. */
  async collectBlock(name: string, count = 1, radius = 32): Promise<number> {
    this.ensureAlive();
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
    this.ensureAlive();
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
        // Force the bot to look at the exact face center before placing — without
        // this the bot often faces the wrong direction and misses the placement.
        const faceCenter = ref.position.offset(
          0.5 + f.x * 0.5,
          0.5 + f.y * 0.5,
          0.5 + f.z * 0.5,
        );
        await this.bot.lookAt(faceCenter, true);
        await this.bot.placeBlock(ref, f);
        return;
      }
    }
    throw new Error(`No adjacent solid block to place ${name} against`);
  }

  /** Craft an item, using a nearby crafting table if one is in reach. */
  async craft(name: string, count = 1): Promise<void> {
    this.ensureAlive();
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

  /** Equip an item from inventory into the main hand. */
  async equip(name: string): Promise<void> {
    this.ensureAlive();
    const item = this.bot.inventory.items().find((i) => i.name === name);
    if (!item) throw new Error(`No ${name} in inventory`);
    await this.bot.equip(item, "hand");
  }

  /** Item counts in the inventory. */
  inventory(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const it of this.bot.inventory.items()) {
      counts[it.name] = (counts[it.name] ?? 0) + it.count;
    }
    return counts;
  }

  /** Dig the block at the given coordinates. Returns true if dug, false if nothing to dig. */
  async dig(x: number, y: number, z: number): Promise<boolean> {
    this.ensureAlive();
    const block = this.bot.blockAt(new Vec3(x, y, z));
    if (!block || !this.bot.canDigBlock(block)) return false;
    await this.bot.dig(block, true);
    return true;
  }

  /** Turn to face a point in the world. */
  async lookAt(x: number, y: number, z: number): Promise<void> {
    this.ensureAlive();
    await this.bot.lookAt(new Vec3(x, y, z), true);
  }

  /** Attack an entity (obtained from findEntities). */
  attack(entity: Entity): void {
    this.ensureAlive();
    this.bot.attack(entity);
  }

  /** Nearby entities sorted by distance, optionally filtered by name. */
  findEntities(name?: string, radius = 32): Entity[] {
    const pos = this.bot.entity.position;
    return Object.values(this.bot.entities)
      .filter((e): e is Entity => e != null && e !== this.bot.entity)
      .filter((e) => !name || e.name === name || e.type === name)
      .filter((e) => e.position.distanceTo(pos) <= radius)
      .sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos));
  }

  /** Snapshot of bot vitals. */
  status(): {
    health: number;
    food: number;
    saturation: number;
    experience: number;
    position: { x: number; y: number; z: number };
  } {
    const { x, y, z } = this.bot.entity.position;
    return {
      health: this.bot.health,
      food: this.bot.food,
      saturation: this.bot.foodSaturation,
      experience: this.bot.experience?.level ?? 0,
      position: { x, y, z },
    };
  }
}

export type Skill = (
  skills: SkillApi,
  args: Record<string, unknown>,
) => Promise<unknown>;
