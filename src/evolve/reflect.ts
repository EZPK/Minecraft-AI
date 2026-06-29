import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import type { AppConfig } from "../config.js";
import { buildModel } from "../model.js";
import type { ScenarioSummary } from "../eval/runner.js";
import { getScenario } from "../eval/scenarios.js";

export interface ReflectInput {
  config: AppConfig;
  /** The worktree to mutate — files are written here. */
  cwd: string;
  /** The weakest scenario this generation, picked by the loop. */
  worst: ScenarioSummary;
}

/**
 * The intelligent mutation operator. Instead of random edits, a coding-only pi
 * session (default read/write/edit/bash tools, no Minecraft tools) inspects the
 * skill library in the worktree and the failure signal, then authors ONE
 * concrete improvement — a new or edited `skills/*.js` file and/or an `AGENTS.md`
 * tweak — directly into the worktree. The loop then re-evaluates it.
 *
 * Scope is deliberately limited to the cwd-isolated behaviour artifacts (the
 * skill library + its usage manual), which is what an evaluation run actually
 * picks up from a worktree.
 */
export async function reflectAndMutate(input: ReflectInput): Promise<void> {
  const { config, cwd, worst } = input;
  const { model, modelRegistry } = buildModel(config.model);

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    appendSystemPrompt: [REFLECTION_PERSONA],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd,
    model: model as never,
    modelRegistry,
    thinkingLevel: config.model.thinkingLevel as never,
    resourceLoader: loader,
    sessionManager: SessionManager.create(cwd),
  });

  session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      console.log(`[reflect] ${event.toolName}`);
    } else if (event.type === "tool_execution_end" && event.isError) {
      console.error(`[reflect] ${event.toolName} → ERROR`);
    }
  });

  console.log(`[reflect] improving weakest scenario "${worst.scenarioId}" (mean ${worst.mean})`);
  await session.prompt(buildReflectionPrompt(worst));
}

const REFLECTION_PERSONA = `
# You are improving a Minecraft agent's skill library

You are NOT playing Minecraft. You are a coding agent editing the repository of
an LLM-powered Minecraft bot to make it play better. The bot's reusable abilities
live as ES modules in \`skills/*.js\`, each \`export default async (skills, args) => …\`,
and its skill-usage manual is \`AGENTS.md\`.

Your job: make ONE focused, high-confidence improvement that addresses the
weakness described below, then stop. Quality over quantity — a single solid
skill beats several speculative ones.

## Rules
- Only edit files under \`skills/\` and \`AGENTS.md\`. Do not touch \`src/\`.
- Read the existing skills first (\`skills/\`) and reuse/extend them; don't
  duplicate. Read \`AGENTS.md\` and \`skills/scan_surroundings.js\` to learn the
  \`SkillApi\` surface — DO NOT invent methods that aren't there.
- Skill files: snake_case names matching \`^[a-z][a-z0-9_]*$\`, a one-line JSDoc
  description on the first line, default args, \`skills.log()\` progress, and
  \`try/catch\` around movement/dig calls. Return a useful value.
- If you add or rename a skill, update \`AGENTS.md\` so the bot knows to use it.
- Keep it syntactically valid JS (the loop runs \`node --check\` and rejects
  anything that fails).
`.trim();

function buildReflectionPrompt(worst: ScenarioSummary): string {
  const scenario = getScenario(worst.scenarioId);
  const goal = scenario?.goalPrompt ?? "(unknown goal)";
  const components = Object.entries(worst.sampleComponents)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `
The agent's weakest evaluation scenario is **${worst.scenarioId}**.

- Goal given to the agent: "${goal}"
- Mean fitness: ${worst.mean} (±${worst.stdDev}) over ${worst.scores.length} scored trial(s)
- Last score breakdown: ${components || "(none)"}
- Avg tool errors/episode: ${worst.avgToolErrors}; avg deaths: ${worst.avgDeaths}; timeouts: ${worst.timeouts}

Diagnose the most likely reason the agent underperforms at this goal, then make
ONE concrete improvement to the skill library (and AGENTS.md) so it does better
next time. Inspect the current skills before writing. When done, briefly state
what you changed and why.
`.trim();
}
