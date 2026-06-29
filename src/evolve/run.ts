// Evolution loop entry point. Same env handling as the eval runner: load
// `.env.eval` (overriding) then `.env` (fallback) before importing config.
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.eval" });
loadDotenv();

const { runEvolution } = await import("./loop.js");

const generations = Math.max(1, Number(process.argv[2] ?? process.env.EVOLVE_GENERATIONS ?? "1"));

runEvolution({ generations })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[evolve] fatal:", err);
    process.exit(1);
  });
