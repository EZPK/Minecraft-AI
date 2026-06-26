import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createBot } from "./bot.js";
import { ChatRouter } from "./chat.js";
import { SkillRuntime } from "./skills-runtime.js";
import { createMinecraftTools } from "./tools/index.js";
import { AgentBrain } from "./agent.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig();

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

  bot.on("kicked", (reason) => console.error("[mindcraft-pi] kicked:", reason));
  bot.on("end", (reason) => {
    console.error(`[mindcraft-pi] disconnected: ${reason}`);
    process.exit(1);
  });
  bot.on("error", (err) => console.error("[mindcraft-pi] bot error:", err));

  console.log(
    `[mindcraft-pi] ready. Talk to me in-game: whisper, mention "${selfName}", or prefix a chat line with "!".`,
  );
}

main().catch((err) => {
  console.error("[mindcraft-pi] fatal:", err);
  process.exit(1);
});
