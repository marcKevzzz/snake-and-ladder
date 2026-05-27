// ============================================================
// Bot AI Controller — Automated Bot Players
// ============================================================

import { ANIM } from './config.js';

export class BotController {
  constructor() {
    this.activeBots = new Set();
  }

  /**
   * Execute a bot's turn with a random delay to feel natural.
   * @param {Function} rollCallback - The function to call when bot "clicks" roll
   * @param {Object} player - The bot player object
   * @returns {Promise}
   */
  async takeTurn(player, rollCallback) {
    if (!player || !player.isBot) return;
    if (this.activeBots.has(player.id)) return; // Prevent double-triggering

    this.activeBots.add(player.id);

    // Random "thinking" delay
    const thinkTime = ANIM.BOT_THINK_MIN + Math.random() * (ANIM.BOT_THINK_MAX - ANIM.BOT_THINK_MIN);
    await this._wait(thinkTime);

    this.activeBots.delete(player.id);

    // Execute the roll
    if (rollCallback) {
      await rollCallback();
    }
  }

  /** Check if a bot is currently "thinking" */
  isBotThinking(playerId) {
    return this.activeBots.has(playerId);
  }

  /** Cancel all pending bot actions */
  cancelAll() {
    this.activeBots.clear();
  }

  /** Simple wait helper */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
