import type { Bot } from "./bot.js";

const MAX_CHAT_LEN = 200; // Minecraft caps around 256; stay safe.
const SEND_INTERVAL_MS = 1100; // Avoid spam-kick.
const NARRATE_MIN_INTERVAL_MS = 1500; // Throttle narration bursts (4s was too high — dropped most lines).

export interface IncomingMessage {
  sender: string;
  text: string;
  whisper: boolean;
}

export type MessageHandler = (msg: IncomingMessage) => void;

/**
 * The chat IS the UI. This routes player messages in (to the agent) and the
 * agent's words out (to in-game chat), chunked and rate-limited so the server
 * doesn't kick us.
 */
interface QueueEntry {
  text: string;
  target: string | null;
}

export class ChatRouter {
  private outQueue: QueueEntry[] = [];
  private timer: NodeJS.Timeout | undefined;
  private replyTarget: string | null = null;
  private lastNarration = "";
  private lastNarrationAt = 0;

  constructor(
    private readonly bot: Bot,
    private readonly selfUsername: string,
  ) {}

  /** Set the player to direct responses to (via /tell). Pass null to broadcast. */
  setReplyTarget(username: string | null): void {
    this.replyTarget = username;
  }

  /**
   * Decide which messages reach the agent. By default: every whisper, plus
   * public messages that mention the bot or start with "!". This keeps the
   * bot from reacting to every line of public chat.
   */
  onPlayerMessage(handler: MessageHandler): void {
    this.bot.on("whisper", (username, message) => {
      if (username === this.selfUsername) return;
      handler({ sender: username, text: message, whisper: true });
    });

    this.bot.on("chat", (username, message) => {
      if (username === this.selfUsername) return;
      const mentioned = message
        .toLowerCase()
        .includes(this.selfUsername.toLowerCase());
      const commanded = message.startsWith("!");
      if (!mentioned && !commanded) return;
      const text = commanded ? message.slice(1).trim() : message;
      handler({ sender: username, text, whisper: false });
    });
  }

  /** Queue text for output, split into chat-sized chunks. */
  say(text: string): void {
    const target = this.replyTarget;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      for (const chunk of chunkText(trimmed, MAX_CHAT_LEN)) {
        this.outQueue.push({ text: chunk, target });
      }
    }
    this.flushSoon();
  }

  /**
   * Broadcast a short, viewer-facing line (a thought summary or an action
   * play-by-play) to public chat, regardless of the current reply target.
   * Throttled and de-duplicated so a burst doesn't flood the channel or get us
   * spam-kicked.
   */
  narrate(text: string): void {
    // Collapse to a single clean line and strip control chars/newlines — some
    // servers silently drop chat that contains them.
    const trimmed = stripControl(text).replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed === this.lastNarration) return;
    const now = Date.now();
    if (now - this.lastNarrationAt < NARRATE_MIN_INTERVAL_MS) return;
    this.lastNarration = trimmed;
    this.lastNarrationAt = now;
    for (const chunk of chunkText(trimmed, MAX_CHAT_LEN)) {
      this.outQueue.push({ text: chunk, target: null });
    }
    this.flushSoon();
  }

  /** Stop the outgoing queue and clear the send timer. Call on disconnect. */
  destroy(): void {
    this.outQueue = [];
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private flushSoon(): void {
    if (this.timer) return;
    const tick = () => {
      const entry = this.outQueue.shift();
      if (entry === undefined) {
        clearInterval(this.timer);
        this.timer = undefined;
        return;
      }
      if (entry.target) {
        this.bot.chat(`/tell ${entry.target} ${entry.text}`);
      } else {
        this.bot.chat(entry.text);
      }
    };
    // Send the first chunk immediately, then on an interval.
    tick();
    this.timer = setInterval(tick, SEND_INTERVAL_MS);
  }
}

/** Remove ASCII control characters (0x00–0x1F and 0x7F) that can break chat. */
function stripControl(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out;
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > max) {
      if (current) chunks.push(current);
      // A single word longer than max: hard-split it.
      if (word.length > max) {
        for (let i = 0; i < word.length; i += max) {
          chunks.push(word.slice(i, i + max));
        }
        current = "";
      } else {
        current = word;
      }
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
