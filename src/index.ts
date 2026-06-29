import { join } from "node:path";
import { loadConfig, type AppConfig } from "./config.js";
import { createBot } from "./bot.js";
import { ChatRouter } from "./chat.js";
import { SkillRuntime } from "./skills-runtime.js";
import { createMinecraftTools } from "./tools/index.js";
import { AgentBrain } from "./agent.js";
import { BotTelemetry } from "./telemetry.js";
import { FileMemory } from "./memory.js";

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
      // Mark dead and stop movement first: tools/skills now fail fast instead of
      // acting on a disconnected bot.
      alive = false;
      chat.destroy();
      try {
        bot.pathfinder?.setGoal(null);
      } catch {
        /* pathfinder may not be loaded / already torn down */
      }
      console.log(`[mindcraft-pi] ${label} — aborting brain…`);
      // Hard deadline covers both checkpoint I/O and the LLM abort call, so a
      // hang at either step never blocks the reconnect loop indefinitely.
      const fallback = setTimeout(resolve, 15_000);
      // Snapshot where we left off so the next session resumes with context,
      // even if the agent never explicitly called `remember`.
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

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig();

  const STABLE_SESSION_MS = 30_000; // reset backoff if a session lasted this long
  let delay = 5_000;
  while (true) {
    const start = Date.now();
    try {
      await runSession(config, cwd);
    } catch (err) {
      console.error("[mindcraft-pi] connection failed:", err);
    }
    // Reset backoff after a session that ran long enough to be "healthy".
    if (Date.now() - start >= STABLE_SESSION_MS) delay = 5_000;
    console.log(`[mindcraft-pi] reconnecting in ${delay / 1000}s…`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 60_000);
  }
}

main().catch((err) => {
  console.error("[mindcraft-pi] fatal:", err);
  process.exit(1);
});
