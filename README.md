# mindcraft-pi

An LLM-powered Minecraft agent: **[pi.dev](https://pi.dev) is the brain,
[Mineflayer](https://github.com/PrismarineJS/mineflayer) is the body, and the
in-game chat is the interface.** Because pi is a *coding* agent, the bot can
write and hot-reload its own Mineflayer skills at runtime (Voyager-style) and
build up a reusable library over time.

```
player chat ⇄ ChatRouter ⇄ pi agent (LLM brain) ⇄ Minecraft tools ⇄ Mineflayer bot ⇄ server
                                        └── writes/runs JS skills in skills/*.js
```

## Quick start

```bash
npm install
cp .env.example .env
# edit .env: your server host/port/version, the bot's Microsoft account,
# your in-game name, and which LLM provider to use.
npm run dev
```

Then, in Minecraft, talk to the bot by **whispering it**, **mentioning its
name** in chat, or prefixing a chat line with **`!`**:

```
!come to me
!chop 5 oak logs and craft a crafting table
```

### First run with a Microsoft account

With `MC_AUTH=microsoft`, the first launch prints a device-code login URL in the
terminal — open it, sign in with the bot's Microsoft account, and tokens are
cached for next time. For a LAN / offline-mode server, set `MC_AUTH=offline` and
`MC_USERNAME` to any name.

## Choosing the LLM provider

Set `MODEL_PROVIDER` in `.env`:

| Provider     | `MODEL_BASE_URL` (default)        | Key needed | Example `MODEL_ID`               |
| ------------ | --------------------------------- | ---------- | -------------------------------- |
| `openrouter` | `https://openrouter.ai/api/v1`    | yes        | `anthropic/claude-opus-4.8`      |
| `ollama`     | `http://localhost:11434/v1`       | no         | `qwen2.5-coder:14b`              |
| `lmstudio`   | `http://localhost:1234/v1`        | no         | (id shown in LM Studio)          |
| `openai`     | `https://api.openai.com/v1`       | yes        | `gpt-4o`                         |
| `anthropic`  | `https://api.anthropic.com`       | yes        | `claude-opus-4-8`                |
| `custom`     | _(set `MODEL_BASE_URL`)_          | optional   | any                              |

Local models (Ollama, LM Studio) run fully offline — no API key.

## What the bot can do

- **Move**: `move_to`, `go_to_player`, `follow_player`, `stop_moving`
- **Perceive**: `status`, `nearby_entities`, `find_blocks`
- **Act on the world**: `mine`, `place_block`
- **Inventory/crafting**: `inventory`, `craft`, `equip`, `toss`
- **Combat**: `attack`
- **Talk**: `say`
- **Learn**: `save_skill`, `run_skill`, `list_skills` — write reusable
  JavaScript skills against the `SkillApi` and grow a library.
- **Ask an expert** (optional): `ask_minecraft_expert` — consult a local
  Minecraft-tuned model (e.g. Andy-4) for recipes and tactics. Enabled only when
  `KNOWLEDGE_MODEL` is set.

## Self-improvement: eval + evolution

The bot can get better at "playing Minecraft" through a closed loop that scores
its behaviour and lets it rewrite its own skill library.

```bash
cp .env.eval.example .env.eval   # set a separate bot account + an "arena" coord
npm run eval                     # score the whole scenario suite on your server
npm run eval -- collect_wood     # score a single scenario
npm run evolve -- 3              # run 3 generations of reflection-driven evolution
```

- **Eval harness** (`src/eval/`) boots the bot headless, injects a goal, and
  scores the before/after world with a fitness function. It returns the bot to a
  fixed **arena** between episodes and skips scenarios whose preconditions aren't
  met, so it never scores the agent on the world's luck.
- **Evolution loop** (`src/evolve/`) baselines the suite on `main`, branches a
  git **worktree**, lets a reflection step (a coding pi session) improve the
  weakest scenario's skills, gates on JS syntax, re-evaluates, and **merges to
  `main` only if the candidate beats baseline** by a variance-sized margin.
  Every accepted change is an ordinary commit you can inspect or revert.

Evaluation runs against your live server (no fixed seed), so it leans on
low-noise signals (tech-tree progress, tool-error rate, deaths) and back-to-back
A/B comparison.

See [`CLAUDE.md`](./CLAUDE.md) for architecture and development notes.
