import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ToolContext, ToolFactory } from "./context.js";
import { navigationTools } from "./navigation.js";
import { perceptionTools } from "./perception.js";
import { worldTools } from "./world.js";
import { inventoryTools } from "./inventory.js";
import { combatTools } from "./combat.js";
import { communicationTools } from "./communication.js";
import { skillTools } from "./skills.js";
import { knowledgeTools } from "./knowledge.js";

const FACTORIES: ToolFactory[] = [
  perceptionTools,
  navigationTools,
  worldTools,
  inventoryTools,
  combatTools,
  communicationTools,
  skillTools,
  knowledgeTools,
];

export function createMinecraftTools(ctx: ToolContext): ToolDefinition[] {
  return FACTORIES.flatMap((factory) => factory(ctx));
}

export type { ToolContext };
