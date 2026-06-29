import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Bot } from "../bot.js";
import type { ChatRouter } from "../chat.js";
import type { SkillRuntime } from "../skills-runtime.js";
import type { Memory } from "../memory.js";

/** Shared state every Minecraft tool needs. */
export interface ToolContext {
  bot: Bot;
  chat: ChatRouter;
  skills: SkillRuntime;
  memory: Memory;
  /**
   * Whether the bot is still connected. When it returns false (the bot was
   * kicked/disconnected), tools fail fast instead of acting on a dead bot.
   * Optional: the eval harness omits it.
   */
  isAlive?: () => boolean;
}

export type ToolFactory = (ctx: ToolContext) => ToolDefinition[];

/** Wrap a string into the AgentToolResult shape pi expects. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

/**
 * Run an async tool action. On success, wrap the returned string in a tool
 * result. On failure, **throw** a labelled error: pi catches a thrown tool
 * error, turns it into an error tool result (the message stays visible to the
 * model), sets `tool_execution_end.isError === true`, and continues the turn —
 * it does NOT crash. This keeps `isError` honest so both the agent and the eval
 * harness can tell a real failure from a success, instead of every failure
 * looking like a successful "X failed: …" result.
 *
 * Soft, non-error outcomes ("no trees nearby") should be returned as a normal
 * string by `fn` — only genuine failures should throw.
 */
export async function guard(
  label: string,
  fn: () => Promise<string>,
): Promise<ReturnType<typeof textResult>> {
  try {
    return textResult(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tool-error] ${label}: ${message}`);
    throw new Error(`${label} failed: ${message}`);
  }
}
