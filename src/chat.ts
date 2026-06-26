import type { Bot } from "./bot.js";

const MAX_CHAT_LEN = 200; // Minecraft caps around 256; stay safe.
const SEND_INTERVAL_MS = 1100; // Avoid spam-kick.
const MAX_QUEUE = 30; // Bound the outbound queue; drop oldest beyond this.

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
    // Keep only the most recent entries so a runaway turn can't grow the queue
    // without bound (and never finish draining).
    if (this.outQueue.length > MAX_QUEUE) {
      this.outQueue.splice(0, this.outQueue.length - MAX_QUEUE);
    }
    this.flushSoon();
  }

  /** Stop the flush timer and drop any pending output. Call on disconnect. */
  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.outQueue = [];
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
      try {
        if (entry.target) {
          this.bot.chat(`/tell ${entry.target} ${entry.text}`);
        } else {
          this.bot.chat(entry.text);
        }
      } catch (err) {
        // Bot may have disconnected mid-flush; stop rather than throw uncaught.
        console.error("[chat] send failed:", err);
        this.dispose();
      }
    };
    // Send the first chunk immediately, then on an interval.
    tick();
    this.timer = setInterval(tick, SEND_INTERVAL_MS);
  }
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
