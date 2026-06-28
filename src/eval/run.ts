// Eval entry point. Loads `.env.eval` (overriding) then `.env` (fallback) BEFORE
// any module that reads config, so evaluation can use a separate bot account and
// arena without touching the live `.env`. Because ESM hoists static imports, the
// real logic is pulled in dynamically AFTER env is in place.
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.eval" }); // eval-specific overrides (arena, username…)
loadDotenv(); // .env fallback; dotenv never overrides already-set vars

const { runEval } = await import("./runner.js");

runEval(process.argv.slice(2))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[eval] fatal:", err);
    process.exit(1);
  });
