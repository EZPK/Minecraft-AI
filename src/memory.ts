import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Cross-session memory. The bot is amnesiac on every (re)connect; this is the
 * durable, curated store of facts it should remember between sessions — base
 * coordinates, known resource sites, the current objective, lessons learned.
 *
 * The interface is deliberately backend-agnostic: today it's a small JSON file
 * loaded whole into the LLM context (the volume is tiny), but a future
 * `VectorMemory` (embeddings + semantic recall) can drop in behind the same
 * methods without touching callers.
 */
export interface MemoryEntry {
  id: string;
  fact: string;
  tags: string[];
  /** Free-form category, e.g. "location", "lesson", "objective". */
  kind: string;
  createdAt: string;
}

export interface RememberOptions {
  tags?: string[];
  kind?: string;
}

/** State captured automatically on shutdown so nothing is lost if the LLM forgot to `remember`. */
export interface CheckpointState {
  objective?: string;
  position?: { x: number; y: number; z: number };
  deaths?: number;
  pathFailures?: number;
}

export interface Memory {
  /** Store a durable fact. Returns its id. */
  remember(fact: string, opts?: RememberOptions): Promise<string>;
  /** Retrieve facts, optionally filtered by a free-text query (substring / tag match). */
  recall(query?: string, limit?: number): Promise<MemoryEntry[]>;
  /** Drop a fact by id. Returns whether it existed. */
  forget(id: string): Promise<boolean>;
  /** Every stored fact (newest first), including the auto checkpoint. */
  all(): Promise<MemoryEntry[]>;
  /** Compact rendering for injection into the system prompt at boot. */
  toContext(): Promise<string>;
  /** Overwrite the single auto-checkpoint entry (no accumulation). */
  checkpoint(state: CheckpointState): Promise<void>;
}

/** The fixed id of the auto-snapshot entry, so checkpoints overwrite rather than pile up. */
const CHECKPOINT_ID = "auto-checkpoint";

// --- shared pure operations on an entry list -------------------------------

function makeEntry(fact: string, opts: RememberOptions): MemoryEntry {
  return {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    fact: fact.trim(),
    tags: (opts.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
    kind: (opts.kind ?? "fact").toLowerCase().trim() || "fact",
    createdAt: new Date().toISOString(),
  };
}

function filterEntries(entries: MemoryEntry[], query?: string, limit = 20): MemoryEntry[] {
  const newestFirst = entries.slice().reverse();
  const q = query?.toLowerCase().trim();
  const matched = q
    ? newestFirst.filter(
        (e) =>
          e.fact.toLowerCase().includes(q) ||
          e.kind.includes(q) ||
          e.tags.some((t) => t.includes(q)),
      )
    : newestFirst;
  return matched.slice(0, limit);
}

function renderContext(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries
    .slice()
    .reverse()
    .map((e) => {
      const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
      return `- (${e.kind})${tags} ${e.fact}`;
    });
  return `# Your memory (from previous sessions)\nFacts you chose to remember. Trust these; use \`recall\` for more.\n${lines.join("\n")}`;
}

function checkpointEntry(state: CheckpointState): MemoryEntry | undefined {
  const parts: string[] = [];
  if (state.objective) parts.push(`Last objective: ${state.objective}`);
  if (state.position) {
    const { x, y, z } = state.position;
    parts.push(`Last position: (${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)})`);
  }
  if (state.deaths) parts.push(`Deaths this session: ${state.deaths}`);
  if (state.pathFailures) parts.push(`Path failures this session: ${state.pathFailures}`);
  if (parts.length === 0) return undefined;
  return {
    id: CHECKPOINT_ID,
    fact: parts.join(". ") + ".",
    tags: ["auto"],
    kind: "checkpoint",
    createdAt: new Date().toISOString(),
  };
}

// --- file-backed implementation --------------------------------------------

interface MemoryFile {
  entries: MemoryEntry[];
}

/**
 * JSON-file backed memory. Mirrors the persistence pattern of `SkillRuntime`
 * (read/write a known file in cwd). Reads are cheap (small file) so we re-read
 * on each op to stay correct across the tool process and the brain.
 */
export class FileMemory implements Memory {
  private readonly path: string;

  constructor(cwd: string, fileName = "memory.json") {
    this.path = join(cwd, fileName);
  }

  private async load(): Promise<MemoryEntry[]> {
    if (!existsSync(this.path)) return [];
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<MemoryFile>;
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch (err) {
      console.error(`[memory] could not read ${this.path}: ${(err as Error).message}`);
      return [];
    }
  }

  private async save(entries: MemoryEntry[]): Promise<void> {
    await writeFile(this.path, JSON.stringify({ entries } satisfies MemoryFile, null, 2), "utf8");
  }

  async remember(fact: string, opts: RememberOptions = {}): Promise<string> {
    if (!fact.trim()) throw new Error("Cannot remember an empty fact.");
    const entries = await this.load();
    const entry = makeEntry(fact, opts);
    entries.push(entry);
    await this.save(entries);
    console.log(`[memory] remember (${entry.id}): ${entry.fact}`);
    return entry.id;
  }

  async recall(query?: string, limit?: number): Promise<MemoryEntry[]> {
    return filterEntries(await this.load(), query, limit);
  }

  async forget(id: string): Promise<boolean> {
    const entries = await this.load();
    const kept = entries.filter((e) => e.id !== id);
    if (kept.length === entries.length) return false;
    await this.save(kept);
    return true;
  }

  async all(): Promise<MemoryEntry[]> {
    return (await this.load()).slice().reverse();
  }

  async toContext(): Promise<string> {
    return renderContext(await this.load());
  }

  async checkpoint(state: CheckpointState): Promise<void> {
    const entry = checkpointEntry(state);
    if (!entry) return;
    const entries = (await this.load()).filter((e) => e.id !== CHECKPOINT_ID);
    entries.push(entry);
    await this.save(entries);
    console.log(`[memory] checkpoint saved: ${entry.fact}`);
  }
}

/**
 * Non-persistent memory. Used by the eval/evolve harness so episodes stay
 * reproducible (no live `memory.json` leaking into a scored run).
 */
export class InMemoryMemory implements Memory {
  private entries: MemoryEntry[] = [];

  async remember(fact: string, opts: RememberOptions = {}): Promise<string> {
    if (!fact.trim()) throw new Error("Cannot remember an empty fact.");
    const entry = makeEntry(fact, opts);
    this.entries.push(entry);
    return entry.id;
  }

  async recall(query?: string, limit?: number): Promise<MemoryEntry[]> {
    return filterEntries(this.entries, query, limit);
  }

  async forget(id: string): Promise<boolean> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    return this.entries.length < before;
  }

  async all(): Promise<MemoryEntry[]> {
    return this.entries.slice().reverse();
  }

  async toContext(): Promise<string> {
    return renderContext(this.entries);
  }

  async checkpoint(state: CheckpointState): Promise<void> {
    const entry = checkpointEntry(state);
    if (!entry) return;
    this.entries = this.entries.filter((e) => e.id !== CHECKPOINT_ID);
    this.entries.push(entry);
  }
}
