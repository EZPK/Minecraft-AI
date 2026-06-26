# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An LLM-powered Minecraft agent in the spirit of Mindcraft, but with a different
split of responsibilities:

- **Brain** — [pi.dev](https://pi.dev) (`@earendil-works/pi-coding-agent`), run
  headless via its SDK. It owns the agent loop, the multi-provider LLM API, the
  session/memory, and the built-in `read`/`bash`/`edit`/`write` coding tools.
- **Body** — [Mineflayer](https://github.com/PrismarineJS/mineflayer) (+
  `mineflayer-pathfinder`, `mineflayer-collectblock`). The bot's eyes and hands
  in the world.
- **UI** — the in-game Minecraft chat. There is no pi TUI. Players talk to the
  bot in chat; the agent's text replies are sent back to chat.

The defining idea: because pi is a *coding* agent, the bot can **write its own
Mineflayer skills in JavaScript at runtime** (Voyager-style) and reuse them,
instead of relying on a fixed skill library.

## Commands

```bash
npm install          # install deps (also pulls nested @earendil-works/pi-* packages)
cp .env.example .env # then fill in server + model details
npm run dev          # run with tsx watch (auto-restart on edit)
npm start            # run once
npm run typecheck    # tsc --noEmit — there is no test suite yet
```

There are no unit tests. To sanity-check wiring without a Minecraft server,
write a throwaway `_smoke.ts` in the repo root and run it with `npx tsx` (it must
live inside the project so Node resolves `node_modules`). `buildModel()` and
`createMinecraftTools()` run fully offline; `AgentBrain.start()` boots a real pi
session without needing the LLM until the first prompt.

## Architecture / data flow

```
player chats in-game
  → ChatRouter (src/chat.ts)         filters: whispers, @mentions, or "!"-prefixed lines
  → AgentBrain.handle (src/agent.ts) prompt() if idle, steer() if mid-task
  → pi AgentSession                  picks tools, may write/run skills
  → Minecraft tools (src/tools/*)    call Mineflayer on the shared Bot
  → assistant text_delta buffered, flushed to ChatRouter.say on message_end
  → ChatRouter chunks + rate-limits  → bot.chat()
```

Key files:

- `src/index.ts` — entry point: load config → connect bot → wire chat ↔ brain.
- `src/model.ts` — **multi-provider model factory**. Every provider is registered
  explicitly on an in-memory `ModelRegistry` as a single-model provider, so
  local/offline servers (Ollama, LM Studio) work without dynamic model
  discovery. OpenRouter/Ollama/LM Studio/OpenAI use the `openai-completions`
  API; Anthropic uses `anthropic-messages`.
- `src/agent.ts` — builds the pi session via `createAgentSession`. The persona is
  added with `DefaultResourceLoader({ appendSystemPrompt })`. Pi automatically
  loads `AGENTS.md` (the agent's skill reference) over `CLAUDE.md`; no override
  needed since pi checks `AGENTS.md` first.
- `src/tools/` — primitive Minecraft tools, one file per domain, each a
  `ToolFactory` (`(ctx) => ToolDefinition[]`) aggregated in `tools/index.ts`.
- `src/skills-runtime.ts` + `src/skill-api.ts` + `src/tools/skills.ts` — the
  Voyager layer. Agent-authored skills live in `skills/*.js` as ESM modules
  (`export default async (skills, args) => …`), hot-reloaded on every run via
  cache-busted dynamic `import`. Pre-built skills (the generic ones) live there
  too and are documented in `AGENTS.md`.

## Conventions that matter

- **ESM + NodeNext.** All local imports use `.js` extensions (even from `.ts`
  sources). `Type` comes from `typebox` (pinned to the version pi bundles).
- **Tools never throw to the model.** Wrap tool bodies in `guard()` from
  `src/tools/context.ts`; it converts errors into a readable tool result so the
  agent can recover instead of the turn crashing.
- **The SkillApi (`src/skill-api.ts`) is a contract.** Its shape is documented to
  the agent in `src/prompt.ts`, and saved skills depend on it. Add methods;
  don't rename or remove existing ones, or you break stored skills.
- **Mineflayer is version-sensitive.** `MC_VERSION` must match the server.
- The pi SDK's real types live under
  `node_modules/@earendil-works/pi-coding-agent/dist/core/*.d.ts` (the package
  root `index.d.ts` is only a re-export barrel). Read those when extending the
  pi integration — e.g. `model-registry.d.ts` for `ProviderConfigInput`,
  `sdk.d.ts` for `CreateAgentSessionOptions`.

## Configuration

All runtime config is environment variables (see `.env.example`): Minecraft
server (`MC_HOST/PORT/VERSION/AUTH/USERNAME`, `BOT_OWNER`) and the LLM brain
(`MODEL_PROVIDER`, `MODEL_ID`, `MODEL_API_KEY`, `MODEL_BASE_URL`,
`THINKING_LEVEL`). `MODEL_PROVIDER` is one of `openrouter | ollama | lmstudio |
openai | anthropic | custom`; local servers need no API key.
