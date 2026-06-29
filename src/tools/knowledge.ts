import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { guard, type ToolFactory } from "./context.js";

// Gated on KNOWLEDGE_MODEL: when unset the tool is simply not registered, so the
// bot runs fine without a local Minecraft model. Andy-4 is a Minecraft-tuned
// (Llama-3.1-8B) model with an 8k context — too small/narrow to be the brain,
// but a great cheap domain oracle the pi brain can consult.
// First call loads the model from disk; allow enough time for that cold start.
const TIMEOUT_MS = 120_000;

const SYSTEM =
  "You are a concise Minecraft expert. Answer with practical, accurate, " +
  "version-agnostic Minecraft knowledge — crafting recipes, the steps/items " +
  "needed to reach a goal, and survival tactics. Be brief and specific; the " +
  "asker is a bot that will act on your answer.";

export const knowledgeTools: ToolFactory = () => {
  // Read env at build time (after dotenv) so registration isn't import-order
  // sensitive.
  const MODEL = process.env.KNOWLEDGE_MODEL;
  if (!MODEL) return [];
  const BASE_URL = (process.env.KNOWLEDGE_BASE_URL ?? "http://localhost:11434").replace(
    /\/+$/,
    "",
  );
  return [
    defineTool({
      name: "ask_minecraft_expert",
      label: "Ask Minecraft expert",
      description:
        "Ask a local Minecraft-specialist model for game knowledge: crafting " +
        "recipes, what items/steps a goal needs, survival tactics. Use it when " +
        "you're unsure how Minecraft works — not for acting in the world.",
      parameters: Type.Object({
        question: Type.String({
          description:
            "A specific Minecraft question, e.g. 'what do I need to craft a stone pickaxe?'",
        }),
      }),
      execute: (_id, p) =>
        guard("ask_minecraft_expert", async () => {
          const res = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: MODEL,
              stream: false,
              messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: p.question },
              ],
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) {
            throw new Error(`Andy-4 request failed: HTTP ${res.status}`);
          }
          const data = (await res.json()) as { message?: { content?: string } };
          const answer = data.message?.content?.trim();
          return answer || "The expert returned no answer.";
        }),
    }),
  ];
};
