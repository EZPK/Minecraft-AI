import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { initFileLogging } from "./log.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createBot } from "./bot.js";
import { ChatRouter } from "./chat.js";
import { SkillRuntime } from "./skills-runtime.js";
import { FileMemory } from "./memory.js";
import { BotTelemetry } from "./telemetry.js";
import { createMinecraftTools } from "./tools/index.js";
import { AgentBrain } from "./agent.js";

async function runSession(config: AppConfig, cwd: string): Promise<void> {
  console.log(
    `[mindcraft-pi] connecting to ${config.minecraft.host}:${config.minecraft.port} (${config.minecraft.version}, auth=${config.minecraft.auth})…`,
  );
  const bot = await createBot(config.minecraft);
  const selfName = bot.username ?? config.minecraft.username;
  console.log(`[mindcraft-pi] spawned as "${selfName}".`);

  // Flipped to false the moment the bot disconnects, so in-flight tools and
  // skills stop acting on a dead bot instead of zombie-looping.
  let alive = true;
  const isAlive = () => alive;

  const chat = new ChatRouter(bot, selfName);
  const telemetry = new BotTelemetry(bot);
  telemetry.start();
  const skills = new SkillRuntime(join(cwd, "skills"), bot, chat, isAlive);
  await skills.init();
  const memory = new FileMemory(cwd);

  const tools = createMinecraftTools({ bot, chat, skills, memory, isAlive });
  const brain = new AgentBrain({ config, chat, customTools: tools, cwd, memory, resumeSession: true });

  // OBS overlay HUD — activate by setting OVERLAY_PORT=8088 in .env
  if (process.env.OVERLAY_PORT) {
    const overlayPort = Number(process.env.OVERLAY_PORT);
    const overlayUrl = pathToFileURL(join(cwd, "overlay_obs", "bot-overlay.mjs")).href;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import(overlayUrl)
      .then((m: any) => (m.startOverlay as (b: unknown, o: { port: number }) => void)(bot, { port: overlayPort }))
      .catch((err: unknown) => console.error("[overlay] failed to start:", err));
  }
  await brain.start();

  chat.onPlayerMessage((msg) => {
    console.log(`[chat] ${msg.sender}: ${msg.text}`);
    void brain.handle(msg);
  });

  console.log(
    `[mindcraft-pi] ready. Talk to me in-game: whisper, mention "${selfName}", or prefix a chat line with "!".`,
  );

  await new Promise<void>((resolve) => {
    let settled = false;
    const shutdown = (label: string) => {
      if (settled) return;
      settled = true;
      // Mark dead first: tools/skills now fail fast instead of acting on a
      // disconnected bot. Stop pathfinder immediately too.
      alive = false;
      chat.destroy();
      try {
        bot.pathfinder?.setGoal(null);
      } catch {
        /* pathfinder may not be loaded / already torn down */
      }
      console.log(`[mindcraft-pi] ${label} — aborting brain…`);
      // Hard deadline: a hang at checkpoint I/O or the LLM abort must not block
      // the reconnect loop indefinitely.
      const fallback = setTimeout(resolve, 15_000);
      const pos = bot.entity?.position;
      void memory
        .checkpoint({
          objective: brain.lastObjective,
          position: pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined,
          deaths: telemetry.counters.deaths,
          pathFailures: telemetry.counters.pathFailures,
        })
        .catch((err) => console.error("[mindcraft-pi] checkpoint failed:", err))
        .then(() => brain.abort())
        .catch(() => { /* abort error must not suppress reconnect */ })
        .finally(() => {
          clearTimeout(fallback);
          resolve();
        });
    };
    bot.on("error", (err) => console.error("[mindcraft-pi] bot error:", err));
    bot.on("kicked", (reason) => {
      console.error("[mindcraft-pi] kicked:", reason);
      shutdown("kicked");
    });
    bot.on("end", (reason) => {
      console.error(`[mindcraft-pi] disconnected: ${reason}`);
      shutdown("disconnected");
    });
  });
}

const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
// A session that lived at least this long is considered "healthy", so the next
// reconnect starts from the initial backoff rather than a grown delay.
const HEALTHY_SESSION_MS = 60_000;

async function main(): Promise<void> {
  const cwd = process.cwd();
  initFileLogging(cwd);
  const config = loadConfig();

  // Last-resort safety net: a stray async throw outside the guarded paths must
  // not silently kill the process and stop the bot.
  process.on("unhandledRejection", (reason) => {
    console.error("[mindcraft-pi] unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[mindcraft-pi] uncaught exception:", err);
  });

  let delay = INITIAL_BACKOFF_MS;
  while (true) {
    const startedAt = Date.now();
    try {
      await runSession(config, cwd);
    } catch (err) {
      console.error("[mindcraft-pi] connection failed:", err);
    }
    // Reset backoff after a healthy session; otherwise grow it.
    if (Date.now() - startedAt >= HEALTHY_SESSION_MS) {
      delay = INITIAL_BACKOFF_MS;
    }
    console.log(`[mindcraft-pi] reconnecting in ${delay / 1000}s…`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, MAX_BACKOFF_MS);
  }
}

main().catch((err) => {
  console.error("[mindcraft-pi] fatal:", err);
  process.exit(1);
});
