import type { Bot } from "./bot.js";

const MAX_CHAT_LEN = 200; // Minecraft caps around 256; stay safe.
const SEND_INTERVAL_MS = 1100; // Avoid spam-kick.

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
export class ChatRouter {
  private outQueue: string[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly bot: Bot,
    private readonly selfUsername: string,
  ) {}

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
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      for (const chunk of chunkText(trimmed, MAX_CHAT_LEN)) {
        this.outQueue.push(chunk);
      }
    }
    this.flushSoon();
  }

  private flushSoon(): void {
    if (this.timer) return;
    const tick = () => {
      const next = this.outQueue.shift();
      if (next === undefined) {
        clearInterval(this.timer);
        this.timer = undefined;
        return;
      }
      this.bot.chat(next);
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
