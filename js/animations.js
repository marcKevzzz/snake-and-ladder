// ============================================================
// Animation Controller — Pawn, Snake, Ladder, and Confetti
// ============================================================

import { ANIM } from './config.js';

export class AnimationController {
  constructor(boardRenderer) {
    this.board = boardRenderer;
  }

  /**
   * Hop a pawn step-by-step through tiles.
   * @param {HTMLElement} pawnEl - The pawn DOM element
   * @param {number} fromTile - Starting tile number
   * @param {number[]} steps - Array of tile numbers to hop through
   * @param {Function} onStep - Optional callback for each step (for sound)
   * @returns {Promise}
   */
  async hopPawn(pawnEl, fromTile, steps, onStep) {
    if (!pawnEl || !steps.length) return;

    pawnEl.classList.add('hopping');

    for (const tile of steps) {
      const pos = this.board.getTilePosition(tile);
      const idx = parseInt(pawnEl.dataset.playerIndex) || 0;
      const offsetX = ((idx % 2) * 2 - 1) * (this.board.tileSize * 0.15);
      const offsetY = (Math.floor(idx / 2) * 2 - 1) * (this.board.tileSize * 0.15);

      await this._animateMoveTo(pawnEl, pos.x + offsetX, pos.y + offsetY, ANIM.PAWN_HOP);
      if (onStep) onStep(tile);
    }

    pawnEl.classList.remove('hopping');
  }

  /**
   * Slide pawn down a snake with a shake effect.
   * @returns {Promise}
   */
  async slideSnake(pawnEl, fromTile, toTile) {
    if (!pawnEl) return;

    // Shake effect at snake head
    pawnEl.classList.add('snake-bite');
    await this._wait(300);
    pawnEl.classList.remove('snake-bite');

    // Slide down to snake tail
    const pos = this.board.getTilePosition(toTile);
    const idx = parseInt(pawnEl.dataset.playerIndex) || 0;
    const offsetX = ((idx % 2) * 2 - 1) * (this.board.tileSize * 0.15);
    const offsetY = (Math.floor(idx / 2) * 2 - 1) * (this.board.tileSize * 0.15);

    pawnEl.classList.add('sliding-snake');
    await this._animateMoveTo(pawnEl, pos.x + offsetX, pos.y + offsetY, ANIM.SNAKE_SLIDE, 'cubic-bezier(0.45, 0.05, 0.55, 0.95)');
    pawnEl.classList.remove('sliding-snake');
  }

  /**
   * Climb pawn up a ladder with a bouncy effect.
   * @returns {Promise}
   */
  async climbLadder(pawnEl, fromTile, toTile) {
    if (!pawnEl) return;

    const pos = this.board.getTilePosition(toTile);
    const idx = parseInt(pawnEl.dataset.playerIndex) || 0;
    const offsetX = ((idx % 2) * 2 - 1) * (this.board.tileSize * 0.15);
    const offsetY = (Math.floor(idx / 2) * 2 - 1) * (this.board.tileSize * 0.15);

    pawnEl.classList.add('climbing-ladder');
    await this._animateMoveTo(pawnEl, pos.x + offsetX, pos.y + offsetY, ANIM.LADDER_CLIMB, 'cubic-bezier(0.34, 1.56, 0.64, 1)');
    pawnEl.classList.remove('climbing-ladder');
  }

  /**
   * Full-screen confetti celebration.
   * @param {string} color - Optional dominant color
   * @returns {Promise}
   */
  async celebrateWin(color) {
    if (typeof confetti !== 'function') return;

    const defaults = {
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: color ? [color, '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'] : undefined
    };

    // Multiple bursts for dramatic effect
    confetti({ ...defaults, angle: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...defaults, angle: 120, origin: { x: 1, y: 0.7 } });

    await this._wait(300);
    confetti({ ...defaults, particleCount: 150, angle: 90, origin: { x: 0.5, y: 0.8 } });

    await this._wait(500);
    // Confetti shower
    const end = Date.now() + ANIM.CONFETTI_DURATION - 1000;
    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        return;
      }
      confetti({
        particleCount: 15,
        angle: 60 + Math.random() * 60,
        spread: 55,
        origin: { x: Math.random(), y: -0.1 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
      });
    }, 250);

    return new Promise(resolve => setTimeout(resolve, ANIM.CONFETTI_DURATION));
  }

  /**
   * Pulse a player card to indicate active turn.
   */
  pulsePlayerCard(cardEl) {
    if (!cardEl) return;
    cardEl.classList.add('active-turn');
    // Remove from other cards
    document.querySelectorAll('.player-card.active-turn').forEach(el => {
      if (el !== cardEl) el.classList.remove('active-turn');
    });
  }

  /**
   * Flash the dice button to indicate it's clickable.
   */
  flashDiceButton(btnEl) {
    if (!btnEl) return;
    btnEl.classList.add('dice-ready');
    setTimeout(() => btnEl.classList.remove('dice-ready'), 1000);
  }

  /**
   * Animate pawn appearing on the board (first move).
   */
  async pawnEnterBoard(pawnEl, toTile) {
    if (!pawnEl) return;
    pawnEl.classList.add('entering-board');
    const pos = this.board.getTilePosition(toTile);
    const idx = parseInt(pawnEl.dataset.playerIndex) || 0;
    const offsetX = ((idx % 2) * 2 - 1) * (this.board.tileSize * 0.15);
    const offsetY = (Math.floor(idx / 2) * 2 - 1) * (this.board.tileSize * 0.15);
    await this._animateMoveTo(pawnEl, pos.x + offsetX, pos.y + offsetY, 400, 'cubic-bezier(0.34, 1.56, 0.64, 1)');
    pawnEl.classList.remove('entering-board');
  }

  // ---- Private Helpers ----

  /** Move element to (x, y) with CSS transition */
  _animateMoveTo(el, x, y, duration, easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)') {
    return new Promise(resolve => {
      el.style.transition = `left ${duration}ms ${easing}, top ${duration}ms ${easing}`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      setTimeout(() => {
        el.style.transition = 'none';
        resolve();
      }, duration + 20);
    });
  }

  /** Simple wait helper */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
