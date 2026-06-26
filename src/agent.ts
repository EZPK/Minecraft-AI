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
  private session!: Awaited<ReturnType<typeof createAgentSession>>["session"];
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
      // Our CLAUDE.md is developer docs, not agent persona — don't load it.
      noContextFiles: true,
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
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            this.textBuffer += event.assistantMessageEvent.delta;
          }
          break;
        case "message_end":
          if (this.textBuffer.trim()) chat.say(this.textBuffer.trim());
          this.textBuffer = "";
          break;
      }
    });
  }

  /** Feed a player's chat message to the agent. */
  async handle(msg: IncomingMessage): Promise<void> {
    const framed = `[${msg.whisper ? "whisper" : "chat"}] ${msg.sender}: ${msg.text}`;
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
      this.opts.chat.say("Sorry, my brain hit an error.");
    } finally {
      this.running = false;
    }
  }
}
