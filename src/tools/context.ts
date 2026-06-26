import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Bot } from "../bot.js";
import type { ChatRouter } from "../chat.js";
import type { SkillRuntime } from "../skills-runtime.js";

/** Shared state every Minecraft tool needs. */
export interface ToolContext {
  bot: Bot;
  chat: ChatRouter;
  skills: SkillRuntime;
}

export type ToolFactory = (ctx: ToolContext) => ToolDefinition[];

/** Wrap a string into the AgentToolResult shape pi expects. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

/** Run an async action, turning thrown errors into a readable tool result. */
export async function guard(
  label: string,
  fn: () => Promise<string>,
): Promise<ReturnType<typeof textResult>> {
  try {
    return textResult(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tool-error] ${label}: ${message}`);
    return textResult(`${label} failed: ${message}`);
  }
}
