import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { guard, type ToolFactory } from "./context.js";

/**
 * The Voyager layer: the agent writes reusable JavaScript skills against the
 * SkillApi, stores them, and runs them. Skills accumulate into a growing
 * library the agent can reuse and compose.
 */
export const skillTools: ToolFactory = ({ skills }) => [
  defineTool({
    name: "list_skills",
    label: "List skills",
    description:
      "List the reusable skills already written, with a one-line description of each.",
    parameters: Type.Object({}),
    execute: () =>
      guard("list_skills", async () => {
        const infos = await skills.list();
        if (!infos.length) {
          return "No skills yet. Write one with save_skill when a task is worth reusing.";
        }
        return infos.map((s) => `- ${s.name}: ${s.description}`).join("\n");
      }),
  }),

  defineTool({
    name: "save_skill",
    label: "Save skill",
    description:
      "Create or overwrite a reusable skill. `code` must be an ES module whose default export is `async (skills, args) => { ... }`. Start the file with a /** one-line description */ JSDoc. Use the SkillApi (skills.bot, skills.goto, skills.gotoPlayer, skills.findBlocks, skills.collectBlock, skills.craft, skills.place, skills.equip, skills.dig, skills.lookAt, skills.findEntities, skills.attack, skills.status, skills.inventory, skills.say, skills.log, skills.wait, ...).",
    parameters: Type.Object({
      name: Type.String({
        description: "snake_case skill name, e.g. \"chop_nearest_tree\".",
      }),
      code: Type.String({ description: "Full ESM source of the skill." }),
    }),
    execute: (_id, p) =>
      guard("save_skill", async () => {
        const path = await skills.save(p.name, p.code);
        return `Saved skill "${p.name}" to ${path}. Run it with run_skill.`;
      }),
  }),

  defineTool({
    name: "run_skill",
    label: "Run skill",
    description:
      "Run a saved skill by name, passing optional JSON arguments. Returns the skill's logs and return value. Skills are hot-reloaded, so edits take effect immediately.",
    parameters: Type.Object({
      name: Type.String(),
      args: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Arguments object passed to the skill as its 2nd parameter.",
        }),
      ),
    }),
    execute: (_id, p) =>
      guard("run_skill", async () => {
        const { result, logs } = await skills.run(p.name, p.args ?? {});
        const parts: string[] = [];
        if (logs.length) parts.push(logs.join("\n"));
        parts.push(
          result === undefined
            ? "Skill finished."
            : `Result: ${safeStringify(result)}`,
        );
        return parts.join("\n");
      }),
  }),
];

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
