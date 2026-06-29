import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { guard, type ToolFactory } from "./context.js";

/**
 * Cross-session memory tools. The bot starts amnesiac on every reconnect, so it
 * should `remember` durable facts (base coords, known resource sites, the
 * current objective, lessons) and `recall` them — especially right after
 * spawning. Stored facts are injected into context at boot too.
 */
export const memoryTools: ToolFactory = ({ memory }) => [
  defineTool({
    name: "remember",
    label: "Remember",
    description:
      "Save a durable fact to your cross-session memory so you recall it after a restart. " +
      "Use for base/home coordinates, chest and resource-site locations, your current " +
      "objective, and lessons (e.g. 'I keep dying in the ravine at -120 64 30').",
    parameters: Type.Object({
      fact: Type.String({ description: "The fact to remember, phrased so it's useful later." }),
      kind: Type.Optional(
        Type.String({
          description: "Category, e.g. 'location' | 'objective' | 'lesson' | 'fact'.",
        }),
      ),
      tags: Type.Optional(
        Type.Array(Type.String(), { description: "Optional keywords to find it by later." }),
      ),
    }),
    execute: (_id, p) =>
      guard("remember", async () => {
        const id = await memory.remember(p.fact, { kind: p.kind, tags: p.tags });
        return `Remembered (${id}).`;
      }),
  }),
  defineTool({
    name: "recall",
    label: "Recall",
    description:
      "Look up facts from your cross-session memory. Omit the query to list everything; " +
      "pass a keyword to filter. Do this after spawning/reconnecting to know where you left off.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: "Keyword to filter by (matches fact text, kind, or tags)." }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results (default 20)." })),
    }),
    execute: (_id, p) =>
      guard("recall", async () => {
        const entries = await memory.recall(p.query, p.limit);
        if (entries.length === 0) {
          return p.query ? `No memories matching "${p.query}".` : "Memory is empty.";
        }
        return entries
          .map((e) => {
            const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
            return `${e.id} (${e.kind})${tags}: ${e.fact}`;
          })
          .join("\n");
      }),
  }),
  defineTool({
    name: "forget",
    label: "Forget",
    description: "Delete a memory by its id (as shown by recall) when it's stale or wrong.",
    parameters: Type.Object({
      id: Type.String({ description: "The memory id to delete." }),
    }),
    execute: (_id, p) =>
      guard("forget", async () => {
        const removed = await memory.forget(p.id);
        return removed ? `Forgot ${p.id}.` : `No memory with id ${p.id}.`;
      }),
  }),
];
