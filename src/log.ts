import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { join } from "node:path";

/**
 * Mirror console.log/console.error to a timestamped file in `logs/` so failures
 * can be reviewed after the fact (the in-game chat and terminal are ephemeral).
 * Call once at startup. Idempotent: a second call is a no-op.
 */
let stream: WriteStream | undefined;
let installed = false;

export function initFileLogging(cwd: string): void {
  if (installed) return;
  installed = true;

  const dir = join(cwd, "logs");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return; // Can't create logs dir — fall back to console only.
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `session-${stamp}.log`);
  stream = createWriteStream(file, { flags: "a" });

  // On slow filesystems (e.g. /mnt/* under WSL2) writes can drain slower than
  // the app logs. Node's writable buffer is unbounded, so a backlog would grow
  // in memory until OOM. Track backpressure and drop file writes while backed
  // up — the console output is unaffected, we just skip mirroring to disk.
  let backedUp = false;
  stream.on("drain", () => {
    backedUp = false;
  });
  stream.on("error", () => {
    backedUp = true; // stop writing on any stream error
  });

  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);

  const write = (level: string, args: unknown[]) => {
    if (backedUp || !stream) return;
    const line = `${new Date().toISOString()} [${level}] ${args
      .map((a) =>
        typeof a === "string" ? a : a instanceof Error ? a.stack ?? a.message : safe(a),
      )
      .join(" ")}\n`;
    // write() returns false when the internal buffer is over the high-water
    // mark; pause mirroring until 'drain' rather than letting it balloon.
    backedUp = !stream.write(stripAnsi(line));
  };

  console.log = (...args: unknown[]) => {
    origLog(...args);
    write("INFO", args);
  };
  console.error = (...args: unknown[]) => {
    origErr(...args);
    write("ERROR", args);
  };

  origLog(`[mindcraft-pi] logging to ${file}`);
}

function safe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Strip terminal color codes (e.g. the dimmed thinking output) from the file.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
