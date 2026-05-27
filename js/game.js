// ============================================================
// Game Engine — Core Snake & Ladder Logic
// ============================================================

import { SNAKES, LADDERS, TOTAL_TILES, PLAYER_COLORS, BOT_NAMES } from './config.js';

export class GameEngine {
  constructor() {
    this.players = [];
    this.currentPlayerIndex = 0;
    this.gameStarted = false;
    this.gameOver = false;
    this.winners = [];
    this.turnCount = 0;
    this.lastRoll = null;
    this.consecutiveSixes = 0;
    this.eventLog = [];
    this.startTime = null;
    this.endTime = null;

    this.snakes = { ...SNAKES };
    this.ladders = { ...LADDERS };
  }

  /** Add a human or bot player. Returns the player object or null if full. */
  addPlayer(name, isBot = false) {
    if (this.players.length >= 4) return null;
    const colorIndex = this.players.length;
    const player = {
      id: this._generateId(),
      name: name || (isBot ? this._randomBotName() : `Player ${colorIndex + 1}`),
      isBot,
      color: PLAYER_COLORS[colorIndex],
      position: 0,        // 0 = off-board, 1-100 = on board
      finished: false,
      rank: null,
      stats: {
        snakeBites: 0,
        laddersClimbed: 0,
        sixesRolled: 0,
        totalMoves: 0
      }
    };
    this.players.push(player);
    this._log('player_joined', { name: player.name, isBot, color: player.color.name });
    return player;
  }

  /** Remove a player by ID */
  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return false;
    this.players.splice(index, 1);
    // Re-assign colors
    this.players.forEach((p, i) => { p.color = PLAYER_COLORS[i]; });
    return true;
  }

  /** Start the game. Returns true if successful. */
  startGame() {
    if (this.players.length < 2) return false;
    this.gameStarted = true;
    this.gameOver = false;
    this.winners = [];
    this.turnCount = 0;
    this.currentPlayerIndex = 0;
    this.consecutiveSixes = 0;
    this.startTime = new Date();
    // Reset all players
    this.players.forEach(p => {
      p.position = 0;
      p.finished = false;
      p.rank = null;
      p.stats = { snakeBites: 0, laddersClimbed: 0, sixesRolled: 0, totalMoves: 0 };
    });
    this._log('game_start', { 
      playerCount: this.players.length,
      players: this.players.map(p => ({ name: p.name, isBot: p.isBot }))
    });
    return true;
  }

  /** Roll the dice. Returns the value (1-6). */
  rollDice() {
    const value = Math.floor(Math.random() * 6) + 1;
    this.lastRoll = value;
    const player = this.getCurrentPlayer();
    if (value === 6) {
      player.stats.sixesRolled++;
      this.consecutiveSixes++;
    } else {
      this.consecutiveSixes = 0;
    }
    this._log('dice_roll', { player: player.name, value, turn: this.turnCount });
    return value;
  }

  /**
   * Execute a player's move after rolling the dice.
   * Returns a result object with animation data, or null if invalid.
   */
  executeMove(diceValue) {
    const player = this.getCurrentPlayer();
    if (!player || player.finished) return null;

    const from = player.position;
    let to = from + diceValue;
    const result = {
      playerId: player.id,
      playerName: player.name,
      diceValue,
      from,
      to: from,
      moved: false,
      steps: [],
      snake: null,
      ladder: null,
      win: false,
      extraTurn: false,
      bounced: false,
      finalPosition: from
    };

    // Three consecutive sixes: back to start
    if (this.consecutiveSixes >= 3) {
      player.position = 0;
      result.to = 0;
      result.finalPosition = 0;
      result.moved = true;
      result.penalty = true;
      this.consecutiveSixes = 0;
      this._log('penalty_three_sixes', { player: player.name });
      this._advanceTurn(false);
      return result;
    }

    // Can't go past 100: Bounce back
    if (to > TOTAL_TILES) {
      const stepsTo100 = TOTAL_TILES - from;
      const bounceSteps = diceValue - stepsTo100;
      to = TOTAL_TILES - bounceSteps;
      result.bounced = true;
      this._log('bounce_back', { player: player.name, from, finalPosition: to });
    }

    // Move player
    player.position = to;
    result.to = to;
    result.moved = true;
    player.stats.totalMoves++;

    // Build step-by-step path for hop animation
    if (result.bounced) {
      for (let i = from + 1; i <= TOTAL_TILES; i++) {
        result.steps.push(i);
      }
      for (let i = TOTAL_TILES - 1; i >= to; i--) {
        result.steps.push(i);
      }
    } else {
      for (let i = from + 1; i <= to; i++) {
        result.steps.push(i);
      }
    }

    // Check for snake
    if (this.snakes[to]) {
      const snakeTo = this.snakes[to];
      result.snake = { from: to, to: snakeTo };
      player.position = snakeTo;
      player.stats.snakeBites++;
      this._log('snake', { player: player.name, from: to, to: snakeTo });
    }

    // Check for ladder
    if (this.ladders[to]) {
      const ladderTo = this.ladders[to];
      result.ladder = { from: to, to: ladderTo };
      player.position = ladderTo;
      player.stats.laddersClimbed++;
      this._log('ladder', { player: player.name, from: to, to: ladderTo });
    }

    result.finalPosition = player.position;

    // Check for win
    if (player.position === TOTAL_TILES) {
      player.finished = true;
      player.rank = this.winners.length + 1;
      this.winners.push(player);
      result.win = true;
      this._log('win', { player: player.name, rank: player.rank, turns: this.turnCount });

      // Check if game is over
      const activePlayers = this.players.filter(p => !p.finished);
      if (activePlayers.length <= 1) {
        // Assign last place
        if (activePlayers.length === 1) {
          activePlayers[0].rank = this.winners.length + 1;
          this.winners.push(activePlayers[0]);
        }
        this.gameOver = true;
        this.endTime = new Date();
        this._log('game_over', {
          rankings: this.winners.map(w => ({ name: w.name, rank: w.rank })),
          totalTurns: this.turnCount,
          duration: this._getDurationSeconds()
        });
      }
    }

    // Determine next turn
    const extraTurn = diceValue === 6 && !player.finished && !this.gameOver;
    result.extraTurn = extraTurn;
    this._advanceTurn(extraTurn);

    return result;
  }

  /** Get the current player whose turn it is */
  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex] || null;
  }

  /** Get full game state (for sync — game_start, session restore) */
  getState() {
    return {
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        color: p.color,
        position: p.position,
        finished: p.finished,
        rank: p.rank,
        stats: { ...p.stats }
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      gameStarted: this.gameStarted,
      gameOver: this.gameOver,
      winners: this.winners.map(w => w.id),
      turnCount: this.turnCount,
      lastRoll: this.lastRoll,
      snakes: this.snakes,
      ladders: this.ladders
    };
  }

  /** Get minimal game state for dice_roll broadcasts (no static config, trimmed players) */
  getMinimalState() {
    return {
      p: this.players.map(p => ({
        id: p.id,
        pos: p.position,
        fin: p.finished,
        rank: p.rank,
        s: p.stats
      })),
      ci: this.currentPlayerIndex,
      go: this.gameOver,
      tc: this.turnCount,
      lr: this.lastRoll,
      _m: 1 // marker for minimal state
    };
  }

  /** Load game state from a host broadcast (for remote players) */
  loadState(state) {
    if (state._m) {
      // Minimal state — update only dynamic fields
      for (const sp of state.p) {
        const local = this.players.find(lp => lp.id === sp.id);
        if (local) {
          local.position = sp.pos;
          local.finished = sp.fin;
          local.rank = sp.rank;
          local.stats = sp.s;
        }
      }
      this.currentPlayerIndex = state.ci;
      this.gameOver = state.go;
      this.turnCount = state.tc;
      this.lastRoll = state.lr;
    } else {
      // Full state — used for game_start and session restore
      this.players = state.players;
      this.currentPlayerIndex = state.currentPlayerIndex;
      this.gameStarted = state.gameStarted !== undefined ? state.gameStarted : true;
      this.gameOver = state.gameOver;
      this.turnCount = state.turnCount;
      this.lastRoll = state.lastRoll;
      if (state.snakes) this.snakes = state.snakes;
      if (state.ladders) this.ladders = state.ladders;
    }

    // Rebuild winners array from players who have finished, sorted by rank
    this.winners = this.players
      .filter(p => p.finished && p.rank != null)
      .sort((a, b) => a.rank - b.rank);
  }

  /** Get match summary for database logging */
  getMatchSummary() {
    return {
      totalTurns: this.turnCount,
      durationSeconds: this._getDurationSeconds(),
      rankings: this.winners.map(w => ({
        name: w.name,
        rank: w.rank,
        isBot: w.isBot,
        position: w.position,
        stats: w.stats
      })),
      players: this.players.map(p => ({
        name: p.name,
        isBot: p.isBot,
        position: p.position,
        rank: p.rank,
        stats: p.stats
      })),
      eventLog: this.eventLog
    };
  }

  // ---- Private Methods ----

  _advanceTurn(extraTurn) {
    if (extraTurn) return; // Same player goes again
    this.turnCount++;
    let nextIndex = (this.currentPlayerIndex + 1) % this.players.length;
    let safety = 0;
    while (this.players[nextIndex].finished && safety < this.players.length) {
      nextIndex = (nextIndex + 1) % this.players.length;
      safety++;
    }
    this.currentPlayerIndex = nextIndex;
  }

  _generateId() {
    return 'p_' + Math.random().toString(36).substring(2, 10);
  }

  _randomBotName() {
    const usedNames = this.players.filter(p => p.isBot).map(p => p.name);
    const available = BOT_NAMES.filter(n => !usedNames.includes(n));
    return available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : `Bot ${this.players.length + 1}`;
  }

  _getDurationSeconds() {
    if (!this.startTime) return 0;
    const end = this.endTime || new Date();
    return Math.floor((end - this.startTime) / 1000);
  }

  _log(type, data) {
    this.eventLog.push({
      type,
      data,
      timestamp: new Date().toISOString(),
      turn: this.turnCount
    });
  }
}
