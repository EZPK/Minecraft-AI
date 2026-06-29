import "dotenv/config";

export type ModelProvider =
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "openai"
  | "anthropic"
  | "custom";

export interface MinecraftConfig {
  host: string;
  port: number;
  version: string;
  auth: "microsoft" | "offline";
  username: string;
  owner: string;
}

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high";
}

export interface AppConfig {
  minecraft: MinecraftConfig;
  model: ModelConfig;
  /**
   * When true, the bot broadcasts a one-line summary of each chain-of-thought
   * block to public chat, so stream viewers can follow what it's doing.
   */
  narrate: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export function loadConfig(): AppConfig {
  const auth = optional("MC_AUTH", "microsoft");
  if (auth !== "microsoft" && auth !== "offline") {
    throw new Error(`MC_AUTH must be "microsoft" or "offline", got "${auth}"`);
  }

  const provider = optional("MODEL_PROVIDER", "openrouter") as ModelProvider;
  const thinking = optional("THINKING_LEVEL", "medium") as ModelConfig["thinkingLevel"];

  return {
    minecraft: {
      host: optional("MC_HOST", "localhost"),
      port: Number(optional("MC_PORT", "25565")),
      version: required("MC_VERSION"),
      auth,
      username: required("MC_USERNAME"),
      owner: required("BOT_OWNER"),
    },
    model: {
      provider,
      modelId: required("MODEL_ID"),
      apiKey: process.env.MODEL_API_KEY || undefined,
      baseUrl: process.env.MODEL_BASE_URL || undefined,
      reasoning: optional("MODEL_REASONING", "false") === "true",
      contextWindow: Number(optional("MODEL_CONTEXT_WINDOW", "200000")),
      maxTokens: Number(optional("MODEL_MAX_TOKENS", "8192")),
      thinkingLevel: thinking,
    },
    narrate: optional("BOT_NARRATE", "true") === "true",
  };
}
