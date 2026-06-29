/**
 * bot-overlay.mjs — OBS HUD for the mindcraft-pi bot.
 *
 * Usage (in src/index.ts, after createBot):
 *   const { startOverlay } = await import('../overlay_obs/bot-overlay.mjs')
 *   startOverlay(bot, { port: 8088 })
 *
 * OBS: add a "Source navigateur" pointing at http://localhost:8088
 *      recommended size: 480×240 (or 480×140 for compact mode)
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {import('mineflayer').Bot} bot
 * @param {{ port?: number }} [opts]
 */
export function startOverlay(bot, { port = 8088 } = {}) {
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();

  // ── state polling ──────────────────────────────────────────────────────────

  const interval = setInterval(() => {
    if (!clients.size) return;
    const state = getState(bot);
    const chunk = `data: ${JSON.stringify(state)}\n\n`;
    for (const res of clients) {
      try { res.write(chunk); } catch { clients.delete(res); }
    }
  }, 100);

  // ── HTTP server ────────────────────────────────────────────────────────────

  const html = readFileSync(join(__dirname, 'overlay.html'));

  const server = createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      // Heartbeat keeps OBS / nginx proxies from closing the SSE connection.
      res.write(': heartbeat\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    } else if (req.url === '/state') {
      // Fallback polling endpoint — same data as SSE but on demand.
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(getState(bot)));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[overlay] HUD → http://localhost:${port}  (OBS browser source)`);
  });

  bot.once('end', () => {
    clearInterval(interval);
    for (const res of clients) { try { res.end(); } catch {} }
    clients.clear();
    server.close();
  });
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Detect what the bot is currently doing, in priority order:
 * 1. bot.overlayAction — manual override (write any string, clear with '')
 * 2. bot.targetDigBlock — mineflayer native (set during bot.dig())
 * 3. bot.pvp?.target — mineflayer-pvp plugin
 * 4. bot.pathfinder?.goal — mineflayer-pathfinder
 * 5. bot.collectBlock?.task — mineflayer-collectblock
 *
 * @param {import('mineflayer').Bot & { overlayAction?: string }} bot
 * @returns {string}
 */
function getAction(bot) {
  if (bot.overlayAction) return bot.overlayAction;
  if (bot.targetDigBlock) {
    const name = bot.targetDigBlock.displayName ?? bot.targetDigBlock.name ?? 'bloc';
    return `⛏️ mine ${name}`;
  }
  if (bot.pvp?.target) {
    const name = bot.pvp.target.displayName ?? bot.pvp.target.name ?? 'entité';
    return `⚔️ attaque ${name}`;
  }
  if (bot.pathfinder?.goal) return `🚶 déplacement`;
  if (bot.collectBlock?.task) return `📦 collecte`;
  return '';
}

/**
 * @param {import('mineflayer').Bot & { overlayAction?: string }} bot
 */
function getState(bot) {
  const held = bot.heldItem;
  const pos  = bot.entity?.position;
  const inv  = {};
  for (const item of (bot.inventory?.items() ?? [])) {
    inv[item.name] = (inv[item.name] ?? 0) + item.count;
  }
  return {
    health:   Math.max(0, bot.health   ?? 0),
    food:     Math.max(0, bot.food     ?? 0),
    saturation: bot.foodSaturation ?? 0,
    xp:       bot.experience?.level ?? 0,
    heldItem: held ? (held.displayName ?? held.name ?? null) : null,
    action:   getAction(bot),
    pos:      pos ? {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      z: Math.round(pos.z),
    } : null,
    /** Top-5 items by count for the compact inventory strip. */
    topItems: Object.entries(inv)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
  };
}
