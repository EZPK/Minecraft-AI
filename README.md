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

See [`CLAUDE.md`](./CLAUDE.md) for architecture and development notes.
