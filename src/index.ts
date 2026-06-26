import { join } from "node:path";
import { loadConfig, type AppConfig } from "./config.js";
import { createBot } from "./bot.js";
import { ChatRouter } from "./chat.js";
import { SkillRuntime } from "./skills-runtime.js";
import { createMinecraftTools } from "./tools/index.js";
import { AgentBrain } from "./agent.js";

async function runSession(config: AppConfig, cwd: string): Promise<void> {
  console.log(
    `[mindcraft-pi] connecting to ${config.minecraft.host}:${config.minecraft.port} (${config.minecraft.version}, auth=${config.minecraft.auth})…`,
  );
  const bot = await createBot(config.minecraft);
  const selfName = bot.username ?? config.minecraft.username;
  console.log(`[mindcraft-pi] spawned as "${selfName}".`);

  const chat = new ChatRouter(bot, selfName);
  const skills = new SkillRuntime(join(cwd, "skills"), bot, chat);
  await skills.init();

  const tools = createMinecraftTools({ bot, chat, skills });
  const brain = new AgentBrain({ config, chat, customTools: tools, cwd });
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
      console.log(`[mindcraft-pi] ${label} — aborting brain…`);
      void brain.abort().finally(resolve);
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

  let delay = 5_000;
  while (true) {
    try {
      await runSession(config, cwd);
    } catch (err) {
      console.error("[mindcraft-pi] connection failed:", err);
    }
    console.log(`[mindcraft-pi] reconnecting in ${delay / 1000}s…`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 60_000);
  }
}

main().catch((err) => {
  console.error("[mindcraft-pi] fatal:", err);
  process.exit(1);
});
