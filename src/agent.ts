import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  getAgentDir,
  type ToolDefinition,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { AppConfig } from "./config.js";
import type { ChatRouter, IncomingMessage } from "./chat.js";
import type { Memory } from "./memory.js";
import { buildModel } from "./model.js";
import { buildPersona } from "./prompt.js";

export interface AgentBrainOptions {
  config: AppConfig;
  chat: ChatRouter;
  customTools: ToolDefinition[];
  cwd: string;
  /** Cross-session memory; its stored facts are injected into context at boot. */
  memory: Memory;
  /**
   * Resume the most recent pi session for this cwd instead of starting fresh.
   * The live bot sets this so it remembers what it was doing across restarts;
   * eval/evolve leave it false to stay reproducible.
   */
  resumeSession?: boolean;
  /**
   * Optional sink for every raw session event. The eval harness uses this to
   * count tool successes/errors (truthful `isError`), retries, and to capture
   * the final assistant reply — without `session` needing to be made public.
   */
  onEvent?: (event: AgentSessionEvent) => void;
}

/**
 * The pi agent session, wired headless: player chat goes in as prompts, the
 * assistant's text comes out to the in-game chat.
 */
export class AgentBrain {
  private session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  private running = false;
  private textBuffer = "";
  /** The latest player goal, kept so it can be checkpointed to memory on shutdown. */
  lastObjective: string | undefined;

  constructor(private readonly opts: AgentBrainOptions) {}

  async start(): Promise<void> {
    const { config, chat, customTools, cwd, memory, resumeSession } = this.opts;
    const { model, modelRegistry } = buildModel(config.model);

    // Inject remembered facts (base, objectives, lessons) into the system prompt
    // so the bot knows where it left off the moment it boots.
    const memoryContext = await memory.toContext();
    const appendSystemPrompt = [buildPersona(config.minecraft)];
    if (memoryContext) appendSystemPrompt.push(memoryContext);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      appendSystemPrompt,
      // AGENTS.md takes priority over CLAUDE.md — pi loads the agent's skill
      // reference and skips the developer-facing CLAUDE.md automatically.
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd,
      model: model as never,
      modelRegistry,
      thinkingLevel: config.model.thinkingLevel as never,
      customTools,
      resourceLoader: loader,
      // Resume the latest session for cross-session memory, or start fresh.
      sessionManager: resumeSession
        ? SessionManager.continueRecent(cwd)
        : SessionManager.create(cwd),
    });
    this.session = session;

    session.subscribe((event) => {
      this.opts.onEvent?.(event);
      switch (event.type) {
        case "agent_start":
          console.log("[brain] thinking…");
          break;
        case "tool_execution_start":
          console.log(`[tool] ${event.toolName}(${compact(event.args)})`);
          // Reliable, model-independent play-by-play for stream viewers.
          if (config.narrate) {
            const line = narrateAction(event.toolName, event.args);
            if (line) chat.narrate(line);
          }
          break;
        case "tool_execution_end":
          if (event.isError) {
            console.error(`[tool] ${event.toolName} → ERROR: ${compact(event.result)}`);
          } else {
            console.log(`[tool] ${event.toolName} → ok`);
          }
          break;
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            this.textBuffer += event.assistantMessageEvent.delta;
          } else if (event.assistantMessageEvent.type === "thinking_end") {
            const thought = event.assistantMessageEvent.content.trim();
            if (thought) {
              console.log(`\x1b[2m🤔 ${thought}\x1b[0m`);
              if (config.narrate) {
                const summary = summarizeThought(thought);
                if (summary) chat.narrate(`💭 ${summary}`);
              }
            }
          }
          break;
        case "message_end": {
          const reply = this.textBuffer.trim();
          if (reply) {
            console.log(`[brain] → ${compact(reply, 160)}`);
            chat.say(reply);
          }
          this.textBuffer = "";
          break;
        }
        case "auto_retry_start":
          console.log(
            `[brain] retrying in ${event.delayMs / 1000}s (attempt ${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`,
          );
          break;
        case "compaction_start":
          console.log("[brain] compacting context…");
          break;
      }
    });
  }

  /** Abort any in-flight agent turn. Safe to call if not started. */
  async abort(): Promise<void> {
    await this.session?.abort();
  }

  /** Feed a player's chat message to the agent. */
  async handle(msg: IncomingMessage): Promise<void> {
    if (!this.session) return;
    const { chat } = this.opts;
    const framed = `[${msg.whisper ? "whisper" : "chat"}] ${msg.sender}: ${msg.text}`;
    this.lastObjective = `${msg.sender}: ${msg.text}`;
    chat.setReplyTarget(msg.sender);
    try {
      if (this.running) {
        // Mid-task: steer the in-flight turn instead of starting a new one.
        await this.session.steer(framed);
        return;
      }
      this.running = true;
      await this.session.prompt(framed);
    } catch (err) {
      console.error("[agent] prompt failed:", err);
      chat.say("Sorry, my brain hit an error.");
    } finally {
      this.running = false;
      chat.setReplyTarget(null);
    }
  }
}

/**
 * Map a tool call to a short, French, viewer-facing play-by-play line. Returns
 * undefined for read-only/meta tools (status, inventory, recall…) that aren't
 * worth narrating. This is the reliable narration channel — it works regardless
 * of whether the model emits any thinking.
 */
function narrateAction(toolName: string, args: unknown): string | undefined {
  const a = (args ?? {}) as Record<string, unknown>;
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const n = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const qty = (v: unknown): string => (n(v) && n(v)! > 1 ? `${n(v)} ` : "");

  switch (toolName) {
    case "mine":
      return `⛏️ Je mine ${qty(a.count)}${s(a.block) ?? "des blocs"}…`;
    case "place_block":
      return `🧱 Je place ${s(a.block) ?? "un bloc"}…`;
    case "craft":
      return `🔨 Je fabrique ${qty(a.count)}${s(a.item) ?? "un objet"}…`;
    case "move_to": {
      const x = n(a.x), y = n(a.y), z = n(a.z);
      return x !== undefined && y !== undefined && z !== undefined
        ? `🚶 Direction (${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)})…`
        : "🚶 Je me déplace…";
    }
    case "go_to_player":
      return `🚶 Je rejoins ${s(a.player) ?? "le joueur"}…`;
    case "follow_player":
      return `🐾 Je suis ${s(a.player) ?? "le joueur"}…`;
    case "attack":
      return `⚔️ J'attaque ${s(a.target) ?? "l'ennemi le plus proche"}…`;
    case "find_blocks":
      return `🔎 Je cherche ${s(a.block) ?? "des blocs"}…`;
    case "run_skill":
      return `🛠️ J'utilise la compétence « ${s(a.name) ?? "?"} »…`;
    case "equip":
      return `🎒 Je m'équipe de ${s(a.item) ?? "un objet"}…`;
    case "toss":
      return `🗑️ Je jette ${s(a.item) ?? "un objet"}…`;
    case "ask_minecraft_expert":
      return "🧠 Je consulte l'expert Minecraft…";
    case "save_skill":
      return `💾 J'écris une nouvelle compétence « ${s(a.name) ?? "?"} »…`;
    case "remember":
      return "📝 Je note ça dans ma mémoire…";
    default:
      return undefined;
  }
}

/**
 * Condense a raw chain-of-thought block into a single viewer-friendly line:
 * strip code blocks and markdown markers, collapse to one line, then keep whole
 * sentences up to a chat-sized cap (always at least the first).
 */
function summarizeThought(thought: string, max = 180): string {
  const flat = thought
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) => line.replace(/^\s*[#>*\-]+\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "";
  let out = "";
  for (const sentence of flat.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  return out || `${flat.slice(0, max - 1)}…`;
}

function compact(v: unknown, max = 80): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  } catch {
    return String(v);
  }
}
