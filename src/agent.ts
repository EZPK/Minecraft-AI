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
  /** When false, use an in-memory session (eval/evolve harness, reproducibility). */
  resumeSession?: boolean;
  /** Memory backend — stored here so callers can access it for shutdown checkpoints. */
  memory?: Memory;
  /** Optional hook for the eval harness — called on every session event. */
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
  /** Updated on every session event; the watchdog uses it to detect a hang. */
  private lastActivity = Date.now();
  /** The latest player goal — kept for checkpoint or eval harness. */
  lastObjective: string | undefined;

  constructor(private readonly opts: AgentBrainOptions) {}

  async start(): Promise<void> {
    const { config, chat, customTools, cwd } = this.opts;
    const { model, modelRegistry } = buildModel(config.model);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      appendSystemPrompt: [buildPersona(config.minecraft)],
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
      sessionManager:
        this.opts.resumeSession === false
          ? SessionManager.inMemory(cwd)
          : SessionManager.create(cwd),
    });
    this.session = session;

    session.subscribe((event) => {
      // Any event means the turn is alive and making progress — keep the
      // watchdog from firing on a legitimately long multi-step task.
      this.lastActivity = Date.now();
      this.opts.onEvent?.(event as AgentSessionEvent);
      switch (event.type) {
        case "agent_start":
          console.log("[brain] thinking…");
          break;
        case "tool_execution_start":
          console.log(`[tool] ${event.toolName}(${compact(event.args)})`);
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
            if (thought) console.log(`\x1b[2m🤔 ${thought}\x1b[0m`);
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
        case "agent_end":
          // The turn loop ended. willRetry=false + an idle bot means the model
          // chose to stop — useful to see whether tasks finish or stall early.
          console.log(
            `[brain] turn ended (messages=${event.messages.length}, willRetry=${event.willRetry})`,
          );
          break;
        case "queue_update":
          console.log(
            `[brain] queue: steering=${event.steering.length} followUp=${event.followUp.length}`,
          );
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

    // Mid-task: steer the in-flight turn instead of starting a new one. Crucially
    // this branch does NOT touch `running` or the reply target — those belong to
    // the active prompt turn. Clearing them here would let a later message fire a
    // second concurrent prompt() and misroute the original turn's replies.
    if (this.running) {
      // Steering only reaches the model if the agent is genuinely still
      // streaming. If `running` is true but pi has gone idle, the message would
      // vanish — surface that mismatch instead of silently dropping it.
      console.log(
        `[agent] steering into running turn (isStreaming=${this.session.isStreaming})`,
      );
      try {
        await this.session.steer(framed);
      } catch (err) {
        console.error("[agent] steer failed:", err);
      }
      return;
    }

    console.log("[agent] new prompt turn");
    this.lastObjective = `${msg.sender}: ${msg.text}`;
    this.running = true;
    chat.setReplyTarget(msg.sender);
    try {
      await this.withWatchdog(this.session.prompt(framed));
    } catch (err) {
      console.error("[agent] prompt failed:", err);
      const stuck = err instanceof Error && err.message.includes("watchdog");
      chat.say(
        stuck
          ? "I got stuck and reset myself — try again."
          : "Sorry, my brain hit an error.",
      );
    } finally {
      this.running = false;
      chat.setReplyTarget(null);
    }
  }

  /**
   * Guard the turn against a *hang*, not against length. A productive multi-step
   * task emits events constantly, so we abort only when no session event has
   * fired for IDLE_TIMEOUT_MS (a genuinely stuck LLM/network call). The threshold
   * is deliberately longer than any single tool/skill timeout so a slow-but-alive
   * tool doesn't trip it.
   */
  private async withWatchdog<T>(work: Promise<T>): Promise<T> {
    this.lastActivity = Date.now();
    let interval: ReturnType<typeof setInterval>;
    const watchdog = new Promise<never>((_, reject) => {
      interval = setInterval(() => {
        const idleMs = Date.now() - this.lastActivity;
        if (idleMs >= IDLE_TIMEOUT_MS) {
          console.error(
            `[agent] watchdog: no activity for ${Math.round(idleMs / 1000)}s — aborting turn`,
          );
          void this.session?.abort();
          reject(new Error("prompt watchdog timeout"));
        }
      }, WATCHDOG_POLL_MS);
    });
    try {
      return await Promise.race([work, watchdog]);
    } finally {
      clearInterval(interval!);
    }
  }
}

// Abort only after this long with zero session events. Must exceed the longest
// single tool/skill timeout (skills: 120s) so a slow tool isn't mistaken for a
// hang.
const IDLE_TIMEOUT_MS = 180_000;
const WATCHDOG_POLL_MS = 15_000;

function compact(v: unknown, max = 80): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  } catch {
    return String(v);
  }
}
