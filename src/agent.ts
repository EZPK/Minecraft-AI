import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  getAgentDir,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AppConfig } from "./config.js";
import type { ChatRouter, IncomingMessage } from "./chat.js";
import { buildModel } from "./model.js";
import { buildPersona } from "./prompt.js";

export interface AgentBrainOptions {
  config: AppConfig;
  chat: ChatRouter;
  customTools: ToolDefinition[];
  cwd: string;
}

/**
 * The pi agent session, wired headless: player chat goes in as prompts, the
 * assistant's text comes out to the in-game chat.
 */
export class AgentBrain {
  private session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  private running = false;
  private textBuffer = "";

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
      sessionManager: SessionManager.create(cwd),
    });
    this.session = session;

    session.subscribe((event) => {
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

function compact(v: unknown, max = 80): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  } catch {
    return String(v);
  }
}
