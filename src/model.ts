import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ModelConfig, ModelProvider } from "./config.js";

/**
 * pi has built-in providers, but for full control over local/offline servers
 * (Ollama, LM Studio) and to avoid relying on dynamic model discovery, we
 * register the chosen provider explicitly as a single-model provider.
 *
 * OpenRouter / Ollama / LM Studio / OpenAI all speak the OpenAI completions
 * API. Anthropic uses its own messages API.
 */

const DEFAULT_BASE_URL: Record<ModelProvider, string | undefined> = {
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  custom: undefined,
};

// Local servers don't validate the key, but the provider config requires one.
const DUMMY_LOCAL_KEY: Partial<Record<ModelProvider, string>> = {
  ollama: "ollama",
  lmstudio: "lm-studio",
};

export interface BuiltModel {
  // `Model<any>` — kept loose to avoid pulling the nested pi-ai types into our app.
  model: unknown;
  modelRegistry: ModelRegistry;
}

export function buildModel(cfg: ModelConfig): BuiltModel {
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL[cfg.provider];
  if (!baseUrl) {
    throw new Error(
      `MODEL_BASE_URL is required when MODEL_PROVIDER=${cfg.provider}`,
    );
  }

  const apiKey =
    cfg.apiKey ?? DUMMY_LOCAL_KEY[cfg.provider] ?? "";
  if (!apiKey && cfg.provider !== "ollama" && cfg.provider !== "lmstudio") {
    throw new Error(
      `MODEL_API_KEY is required for provider ${cfg.provider}`,
    );
  }

  const api =
    cfg.provider === "anthropic" ? "anthropic-messages" : "openai-completions";

  const authStorage = AuthStorage.inMemory();
  const registry = ModelRegistry.inMemory(authStorage);

  registry.registerProvider(cfg.provider, {
    name: cfg.provider,
    baseUrl,
    apiKey,
    api,
    models: [
      {
        id: cfg.modelId,
        name: cfg.modelId,
        api,
        reasoning: cfg.reasoning,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: cfg.contextWindow,
        maxTokens: cfg.maxTokens,
      },
    ],
  });

  const model = registry.find(cfg.provider, cfg.modelId);
  if (!model) {
    throw new Error(
      `Failed to register model ${cfg.provider}/${cfg.modelId}`,
    );
  }

  return { model, modelRegistry: registry };
}
