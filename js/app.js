// ============================================================
// App Controller — Main Application Entry Point
// ============================================================

import { GameEngine } from './game.js';
import { BoardRenderer } from './board.js';
import { DiceRenderer } from './dice.js';
import { AnimationController } from './animations.js';
import { SoundManager } from './sounds.js';
import { BotController } from './bot.js';
import { Database } from './database.js';
import { MultiplayerManager } from './multiplayer.js';
import { LeaderboardUI } from './leaderboard.js';
import { PLAYER_COLORS } from './config.js';

class App {
  constructor() {
    this.game = null;
    this.board = null;
    this.dice = null;
    this.anims = null;
    this.sounds = new SoundManager();
    this.bot = new BotController();
    this.db = new Database();
    this.mp = null;
    this.leaderboard = null;

    this.currentScreen = 'lobby';
    this.isProcessingTurn = false;
    this.localPlayers = []; // For lobby player list
    this.roomCode = null;
    this.isHost = true;
    this.isOnlineMode = false;
    this.myPlayerName = '';
  }

  /** Initialize the application */
  init() {
    // Set up multiplayer if Supabase is available
    const client = this.db.getClient();
    if (client) {
      this.mp = new MultiplayerManager(client);
      this._setupMultiplayerCallbacks();
    }

    // Bind UI events
    this._bindLobbyEvents();
    this._bindGameEvents();
    this._bindNavEvents();
    this._bindChatEvents();

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.board) {
        this.board.handleResize();
        if (this.game && this.game.gameStarted) {
          this.board.updatePawnPositions(this.game.players);
        }
      }
    });

    // Try to restore session on load
    this._restoreSession();

    // Confirm navigation before unloading window during active match
    window.addEventListener('beforeunload', (e) => {
      if ((this.game && !this.game.gameOver && this.game.gameStarted) || (this.isOnlineMode && this.roomCode)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    console.log('🎲 Snake & Ladder initialized!');
  }

  // ============================================================
  // Screen Management
  // ============================================================

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });
    const screen = document.getElementById(`screen-${name}`);
    if (screen) {
      screen.classList.remove('hidden');
      screen.classList.add('active');
    }
    this.currentScreen = name;

    // Show/hide chat panel in online mode
    const chat = document.getElementById('online-chat-wrapper');
    const chatToggle = document.getElementById('btn-chat-toggle');
    if (name === 'game' && this.isOnlineMode) {
      chat?.classList.remove('hidden');
      
      // Default chat to hidden on mobile/tablet view to prevent screen blocking
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        chat?.classList.add('chat-hidden');
      } else {
        chat?.classList.remove('chat-hidden');
      }

      const isChatHidden = chat?.classList.contains('chat-hidden');
      if (chatToggle) chatToggle.style.display = isChatHidden ? 'flex' : 'none';
    } else {
      chat?.classList.add('hidden');
      chat?.classList.remove('chat-hidden');
      if (chatToggle) chatToggle.style.display = 'none';
    }

    // Initialize screen-specific content
    if (name === 'leaderboard') {
      this._initLeaderboard();
    }
  }

  // ============================================================
  // Lobby
  // ============================================================

  _bindLobbyEvents() {
    // Mode tabs
    document.getElementById('tab-local')?.addEventListener('click', () => this._setMode('local'));
    document.getElementById('tab-online')?.addEventListener('click', () => this._setMode('online'));

    // Local mode buttons
    document.getElementById('btn-add-player')?.addEventListener('click', () => this._addLocalPlayer());
    document.getElementById('btn-add-bot')?.addEventListener('click', () => this._addBot());
    document.getElementById('btn-start-local')?.addEventListener('click', () => this._startLocalGame());

    // Online mode buttons
    document.getElementById('btn-create-room')?.addEventListener('click', () => this._createRoom());
    document.getElementById('btn-join-room')?.addEventListener('click', () => this._joinRoom());
    document.getElementById('btn-add-bot-online')?.addEventListener('click', () => this._addBot());
    document.getElementById('btn-start-online')?.addEventListener('click', () => this._startOnlineGame());
    document.getElementById('btn-leave-lobby-online')?.addEventListener('click', () => this.confirmLeaveMatch());

    // Enter key on inputs
    document.getElementById('player-name-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addLocalPlayer();
    });
    document.getElementById('join-code-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._joinRoom();
    });
    document.getElementById('online-name-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const createBtn = document.getElementById('btn-create-room');
        if (createBtn && !createBtn.disabled) createBtn.click();
      }
    });
  }

  _setMode(mode) {
    this.isOnlineMode = mode === 'online';
    document.getElementById('tab-local')?.classList.toggle('active', mode === 'local');
    document.getElementById('tab-online')?.classList.toggle('active', mode === 'online');
    document.getElementById('local-mode')?.classList.toggle('hidden', mode !== 'local');
    document.getElementById('online-mode')?.classList.toggle('hidden', mode !== 'online');
    this._renderPlayerList();
  }

  _addLocalPlayer() {
    const input = document.getElementById('player-name-input');
    const name = input?.value.trim();
    if (!name) { this._shake(input); return; }
    if (this.localPlayers.length >= 4) { this._showToast('Maximum 4 players!'); return; }
    if (this.localPlayers.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      this._showToast('Name already taken!'); return;
    }

    this.localPlayers.push({ name, isBot: false });
    input.value = '';
    this.sounds.playClick();
    this._renderPlayerList();
  }

  _addBot() {
    if (this.localPlayers.length >= 4) { this._showToast('Maximum 4 players!'); return; }
    this.localPlayers.push({ name: '', isBot: true }); // Name assigned by game engine
    this.sounds.playClick();
    this._renderPlayerList();

    if (this.isOnlineMode && this.isHost && this.mp) {
      this.mp.broadcastGameState({
        type: 'lobby_update',
        players: this.localPlayers
      });
    }
  }

  _removePlayer(index) {
    const player = this.localPlayers[index];
    if (this.isOnlineMode && this.isHost && this.mp && player && !player.isBot) {
      this.mp.broadcastGameState({
        type: 'kick_player',
        name: player.name
      });
    }

    this.localPlayers.splice(index, 1);
    this.sounds.playClick();
    this._renderPlayerList();

    if (this.isOnlineMode && this.isHost && this.mp) {
      this.mp.broadcastGameState({
        type: 'lobby_update',
        players: this.localPlayers
      });
    }
  }

  _renderPlayerList() {
    const listId = this.isOnlineMode ? 'player-list-online' : 'player-list';
    const list = document.getElementById(listId);
    if (!list) return;

    if (this.localPlayers.length === 0) {
      list.innerHTML = this.isOnlineMode
        ? '<div class="empty-list">Waiting for players...</div>'
        : '<div class="empty-list">Add players to start! (minimum 2)</div>';
    } else {
      list.innerHTML = this.localPlayers.map((p, i) => {
        const color = PLAYER_COLORS[i] || { hex: '#999999' };
        const displayName = p.isBot ? `🤖 Bot ${i + 1}` : p.name;
        const showRemove = !this.isOnlineMode || this.isHost;
        const removeButton = showRemove
          ? `<button class="btn-remove" onclick="window.__app._removePlayer(${i})" title="Remove">✕</button>`
          : '';
        return `
          <div class="player-list-item" style="--accent: ${color.hex}">
            <span class="player-list-color" style="background: ${color.hex}"></span>
            <span class="player-list-name">${displayName}</span>
            ${removeButton}
          </div>
        `;
      }).join('');
    }

    // Update start button state
    const startBtn = this.isOnlineMode
      ? document.getElementById('btn-start-online')
      : document.getElementById('btn-start-local');
    if (startBtn) {
      startBtn.disabled = this.localPlayers.length < 2;
    }
  }

  // ============================================================
  // Online Multiplayer
  // ============================================================

  async _createRoom() {
    const nameInput = document.getElementById('online-name-input');
    const name = nameInput?.value.trim();
    if (!name) { this._shake(nameInput); return; }
    if (!this.mp || !this.mp.isAvailable) {
      this._showToast('Online mode requires Supabase configuration');
      return;
    }

    this.myPlayerName = name;
    this.isHost = true;
    this.localPlayers = [{ name, isBot: false }];

    try {
      this.roomCode = await this.mp.createRoom(name);
      this._showRoomLobby();
      this._renderPlayerList();
      this.saveActiveSession();
      this._showToast(`Room ${this.roomCode} created!`);
    } catch (e) {
      this._showToast('Failed to create room');
      console.error(e);
    }
  }

  async _joinRoom() {
    const nameInput = document.getElementById('online-name-input');
    const codeInput = document.getElementById('join-code-input');
    const name = nameInput?.value.trim();
    const code = codeInput?.value.trim().toUpperCase();

    if (!name) { this._shake(nameInput); return; }
    if (!code) { this._shake(codeInput); return; }
    if (!this.mp || !this.mp.isAvailable) {
      this._showToast('Online mode requires Supabase configuration');
      return;
    }

    this.myPlayerName = name;
    this.isHost = false;
    this.roomCode = code;

    try {
      await this.mp.joinRoom(code, name);
      this._showRoomLobby();
      this.saveActiveSession();
      this._showToast(`Joined room ${code}!`);
    } catch (e) {
      this._showToast('Failed to join room');
      console.error(e);
    }
  }

  _showRoomLobby() {
    const onlineSetup = document.getElementById('online-setup');
    const roomLobby = document.getElementById('room-lobby');
    if (onlineSetup) onlineSetup.classList.add('hidden');
    if (roomLobby) {
      roomLobby.classList.remove('hidden');
      document.getElementById('room-code-display').textContent = this.roomCode;
    }
    // Show/hide host-only controls
    document.getElementById('btn-add-bot-online')?.classList.toggle('hidden', !this.isHost);
    document.getElementById('btn-start-online')?.classList.toggle('hidden', !this.isHost);
  }

  _setupMultiplayerCallbacks() {
    if (!this.mp) return;

    this.mp.onPresenceSync = (state) => {
      // Update player list from presence while preserving any active bots
      const players = Object.values(state).flat();
      const bots = this.localPlayers.filter(p => p.isBot);
      
      const humanPlayers = players.map(p => ({
        name: p.name,
        isBot: false
      }));

      this.localPlayers = [...humanPlayers, ...bots];
      this._renderPlayerList();

      // If host, debounce lobby broadcast to avoid rapid-fire updates
      if (this.isHost) {
        clearTimeout(this._lobbySyncTimer);
        this._lobbySyncTimer = setTimeout(() => {
          this.mp.broadcastGameState({
            type: 'lobby_update',
            players: this.localPlayers
          });
        }, 150);
      }
    };

    this.mp.onGameStart = (gameState) => {
      if (!this.isHost) {
        this._initGameFromState(gameState);
      }
    };

    this.mp.onGameUpdate = (data) => {
      if (data.type === 'dice_roll') {
        this._handleRemoteDiceRoll(data);
      } else if (!this.isHost && data.type === 'lobby_update') {
        this.localPlayers = data.players;
        this._renderPlayerList();
      } else if (data.type === 'player_left') {
        this._showToast(`🚫 ${data.name} has left the match.`);
        this._updateGameLog({
          text: `🚫 ${data.name} has left the match.`,
          type: 'warning'
        });
        if (data.isHost) {
          this._showToast("Host left. Returning to lobby...");
          setTimeout(() => {
            localStorage.removeItem('snl_active_session');
            localStorage.removeItem('snl_local_game_state');
            location.reload();
          }, 3000);
        }
      } else if (data.type === 'kick_player') {
        if (data.name === this.myPlayerName) {
          this._showToast("🚫 You have been kicked from the room by the host.");
          setTimeout(() => {
            localStorage.removeItem('snl_active_session');
            localStorage.removeItem('snl_local_game_state');
            localStorage.removeItem(`snl_chat_${this.roomCode}`);
            localStorage.removeItem(`snl_log_${this.roomCode}`);
            if (this.mp) {
              this.mp.leaveRoom().catch(console.error);
            }
            location.reload();
          }, 2500);
        }
      } else if (!this.isHost && data.type !== 'dice_roll') {
        // Full state update
        if (this.game) {
          this.game.loadState(data);
          this.board.updatePawnPositions(this.game.players);
          this._updatePlayerCards();
          this._updateTurnUI();
          this._updateGameLog(data.lastLogEntry);
        } else {
          // If rejoining an active match, initialize client game elements
          this._initGameFromState(data);
          this._showToast("Synced with host!");
        }
      }
    };

    this.mp.onChatMessage = (data) => {
      // self: false means we only get messages from others
      this._addChatMessage(data.from, data.message, false);
    };
  }

  async _startOnlineGame() {
    if (!this.isHost) return;
    this._startLocalGame(); // Same logic — host runs the game
    if (this.mp) {
      this.mp.broadcastGameStart(this.game.getState());
    }
  }

  // ============================================================
  // Game Initialization
  // ============================================================

  _startLocalGame() {
    if (this.localPlayers.length < 2) {
      this._showToast('Need at least 2 players!');
      return;
    }

    this.sounds.playClick();

    // Create game engine
    this.game = new GameEngine();
    this.localPlayers.forEach(p => {
      this.game.addPlayer(p.isBot ? '' : p.name, p.isBot);
    });

    // Update local player names (bots get auto-names)
    this.localPlayers = this.game.players.map(p => ({
      name: p.name,
      isBot: p.isBot
    }));

    this.game.startGame();

    // Switch to game screen
    this.showScreen('game');
    this.saveActiveSession();

    // Initialize board
    this.board = new BoardRenderer(document.getElementById('game-board'));
    this.board.render();

    // Initialize dice
    this.dice = new DiceRenderer(document.getElementById('dice-container'));

    // Initialize animations
    this.anims = new AnimationController(this.board);

    localStorage.removeItem('snl_log_local');
    this._restoreChatAndLogs();

    // Create pawns after a frame (so board dimensions are calculated)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.board.createPawns(this.game.players);
        this.board.updatePawnPositions(this.game.players);
        this._updatePlayerCards();
        this._updateTurnUI();
        this._updateGameLog({ text: '🎲 Game started! Roll the dice!', type: 'system' });
      });
    });
  }

  _initGameFromState(gameState) {
    this.game = new GameEngine();
    this.game.loadState(gameState);
    this.showScreen('game');

    this.board = new BoardRenderer(document.getElementById('game-board'));
    this.board.render();
    this.dice = new DiceRenderer(document.getElementById('dice-container'));
    this.anims = new AnimationController(this.board);

    this._restoreChatAndLogs();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.board.createPawns(this.game.players);
        this.board.updatePawnPositions(this.game.players);
        this._updatePlayerCards();
        this._updateTurnUI();
      });
    });
  }

  // ============================================================
  // Game Events
  // ============================================================

  _bindGameEvents() {
    document.getElementById('btn-roll')?.addEventListener('click', () => this._onRollDice());

    // Results screen buttons
    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      this.showScreen('lobby');
      this.localPlayers = [];
      this._renderPlayerList();
    });
    document.getElementById('btn-results-leaderboard')?.addEventListener('click', () => {
      this.showScreen('leaderboard');
      this._initLeaderboard();
    });
  }

  async _onRollDice() {
    if (this.isProcessingTurn) return;
    if (!this.game || this.game.gameOver) return;

    const currentPlayer = this.game.getCurrentPlayer();
    if (!currentPlayer) return;

    // In online mode, strictly restrict turn rolling
    if (this.isOnlineMode) {
      if (currentPlayer.isBot) {
        // Only host can roll for bots
        if (!this.isHost) return;
      } else {
        // Human turn: only the player themselves can roll
        if (currentPlayer.name !== this.myPlayerName) return;
      }
    }

    this.isProcessingTurn = true;
    const rollBtn = document.getElementById('btn-roll');
    if (rollBtn) rollBtn.disabled = true;

    // Roll dice
    const diceValue = this.game.rollDice();

    // Animate dice
    this.sounds.playDiceRoll();
    await this.dice.roll(diceValue);

    // Execute move
    const result = this.game.executeMove(diceValue);

    // Log the roll
    this._updateGameLog({
      text: `🎲 ${currentPlayer.name} rolled a ${diceValue}`,
      type: 'roll'
    });

    if (result) {
      // Animate pawn movement
      if (result.moved && result.steps.length > 0) {
        const pawn = this.board.getPawnElement(result.playerId);
        
        await this.anims.hopPawn(pawn, result.from, result.steps, () => {
          this.sounds.playPawnHop();
        });

        // Snake animation
        if (result.snake) {
          this._updateGameLog({
            text: `🐍 ${currentPlayer.name} got bitten! Slides from ${result.snake.from} to ${result.snake.to}`,
            type: 'snake'
          });
          this.sounds.playSnakeHiss();
          await this.anims.slideSnake(
            this.board.getPawnElement(result.playerId),
            result.snake.from,
            result.snake.to
          );
        }

        // Ladder animation
        if (result.ladder) {
          this._updateGameLog({
            text: `🪜 ${currentPlayer.name} climbs a ladder! ${result.ladder.from} → ${result.ladder.to}`,
            type: 'ladder'
          });
          this.sounds.playLadderClimb();
          await this.anims.climbLadder(
            this.board.getPawnElement(result.playerId),
            result.ladder.from,
            result.ladder.to
          );
        }
      }

      if (result.bounced) {
        this._updateGameLog({
          text: `↩️ ${currentPlayer.name} bounced back from 100! Landed on tile ${result.to}`,
          type: 'info'
        });
      }

      if (result.penalty) {
        this._updateGameLog({
          text: `⚠️ ${currentPlayer.name} rolled three 6s in a row! Back to start!`,
          type: 'warning'
        });
      }

      // Extra turn notification
      if (result.extraTurn && !result.win) {
        this._updateGameLog({
          text: `🎉 ${currentPlayer.name} rolled a 6 — extra turn!`,
          type: 'bonus'
        });
        this.sounds.playExtraTurn();
      }

      // Win celebration
      if (result.win) {
        this._updateGameLog({
          text: `🏆 ${currentPlayer.name} reaches 100! Finished #${currentPlayer.rank}!`,
          type: 'win'
        });
        this.sounds.playWinFanfare();
        await this.anims.celebrateWin(currentPlayer.color.hex);
      }

      // Update board positions
      this.board.updatePawnPositions(this.game.players);
    }

    // Broadcast state in online mode (use minimal payload for speed)
    if (this.isOnlineMode && this.mp) {
      this.mp.broadcastDiceRoll({
        diceValue,
        result,
        gs: this.game.getMinimalState()
      });
    }

    // Update UI
    this._updatePlayerCards();
    this.saveActiveSession();

    // Check game over
    if (this.game.gameOver) {
      await this._handleGameOver();
      this.isProcessingTurn = false;
      return;
    }

    this.isProcessingTurn = false;
    this._updateTurnUI();

    // Handle bot turn (only host executes bot moves in online mode)
    const nextPlayer = this.game.getCurrentPlayer();
    if (nextPlayer && nextPlayer.isBot) {
      if (!this.isOnlineMode || this.isHost) {
        this.bot.takeTurn(nextPlayer, () => this._onRollDice());
      }
    }
  }

  async _handleRemoteDiceRoll(data) {
    if (!this.game || !data.result) return;

    const result = data.result;
    const diceValue = data.diceValue;
    const gameState = data.gs || data.gameState; // support both minimal and full payloads

    const roller = this.game.players.find(p => p.id === result.playerId);
    if (!roller) return;

    // Start dice animation immediately (don't wait for state application)
    const dicePromise = this.dice.roll(diceValue);
    this.sounds.playDiceRoll();

    // Log the remote roll
    this._updateGameLog({
      text: `🎲 ${roller.name} rolled a ${diceValue}`,
      type: 'roll'
    });

    // Apply state while dice is animating
    if (gameState) {
      this.game.loadState(gameState);
    }

    // Wait for dice animation to finish
    await dicePromise;

    // Animate pawn movement
    if (result.moved && result.steps?.length > 0) {
      const pawn = this.board.getPawnElement(result.playerId);
      if (pawn) {
        await this.anims.hopPawn(pawn, result.from, result.steps, () => {
          this.sounds.playPawnHop();
        });

        if (result.snake) {
          this._updateGameLog({
            text: `🐍 ${roller.name} got bitten! Slides from ${result.snake.from} to ${result.snake.to}`,
            type: 'snake'
          });
          this.sounds.playSnakeHiss();
          await this.anims.slideSnake(pawn, result.snake.from, result.snake.to);
        }
        if (result.ladder) {
          this._updateGameLog({
            text: `🪜 ${roller.name} climbs a ladder! ${result.ladder.from} → ${result.ladder.to}`,
            type: 'ladder'
          });
          this.sounds.playLadderClimb();
          await this.anims.climbLadder(pawn, result.ladder.from, result.ladder.to);
        }
      }
    }

    if (result.bounced) {
      this._updateGameLog({
        text: `↩️ ${roller.name} bounced back from 100! Landed on tile ${result.to}`,
        type: 'info'
      });
    }

    if (result.penalty) {
      this._updateGameLog({
        text: `⚠️ ${roller.name} rolled three 6s in a row! Back to start!`,
        type: 'warning'
      });
    }

    if (result.extraTurn && !result.win) {
      this._updateGameLog({
        text: `🎉 ${roller.name} rolled a 6 — extra turn!`,
        type: 'bonus'
      });
    }

    if (result.win) {
      this._updateGameLog({
        text: `🏆 ${roller.name} reaches 100! Finished #${roller.rank}!`,
        type: 'win'
      });
      this.sounds.playWinFanfare();
      await this.anims.celebrateWin(roller.color.hex);
    }

    this.board.updatePawnPositions(this.game.players);
    this._updatePlayerCards();
    this.saveActiveSession();

    if (this.game.gameOver) {
      await this._handleGameOver();
    } else {
      this._updateTurnUI();
    }
  }

  // ============================================================
  // Game Over & Results
  // ============================================================

  async _handleGameOver() {
    const summary = this.game.getMatchSummary();

    // Save match to database — only host saves in online mode to prevent duplicates
    const shouldSave = !this.isOnlineMode || this.isHost;
    if (shouldSave) {
      try {
        await this.db.saveMatch({
          roomCode: this.roomCode || 'LOCAL',
          winnerName: this.game.winners[0]?.name || 'Unknown',
          numPlayers: this.game.players.length,
          numBots: this.game.players.filter(p => p.isBot).length,
          totalTurns: summary.totalTurns,
          startedAt: this.game.startTime?.toISOString(),
          durationSeconds: summary.durationSeconds,
          players: summary.players,
          eventLog: this.game.eventLog
        });

        // Update player stats
        for (const player of this.game.players) {
          if (!player.isBot) {
            await this.db.updatePlayerStats(player.name, {
              won: player.rank === 1,
              snakeBites: player.stats.snakeBites,
              laddersClimbed: player.stats.laddersClimbed,
              sixesRolled: player.stats.sixesRolled
            });
          }
        }
      } catch (e) {
        console.warn('Failed to save match:', e);
      }
    }

    // Clean up active session tracking
    localStorage.removeItem('snl_active_session');
    localStorage.removeItem('snl_local_game_state');
    localStorage.removeItem('snl_log_local');
    if (this.roomCode) {
      localStorage.removeItem(`snl_chat_${this.roomCode}`);
      localStorage.removeItem(`snl_log_${this.roomCode}`);
    }

    // Show results after a delay
    setTimeout(() => this._showResults(summary), 2000);
  }

  _showResults(summary) {
    this.showScreen('results');

    const rankings = document.getElementById('results-rankings');
    if (rankings) {
      rankings.innerHTML = this.game.winners.map((player, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖️';
        const isWinner = i === 0;
        return `
          <div class="result-card ${isWinner ? 'winner' : ''}" style="--accent: ${player.color.hex}">
            <div class="result-medal">${medal}</div>
            <div class="result-info">
              <span class="result-name">${player.name}</span>
              <span class="result-rank">${this._ordinal(player.rank)} Place</span>
            </div>
            <div class="result-stats">
              <span>🐍 ${player.stats.snakeBites}</span>
              <span>🪜 ${player.stats.laddersClimbed}</span>
              <span>🎲 ${player.stats.sixesRolled}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const stats = document.getElementById('match-stats');
    if (stats) {
      stats.innerHTML = `
        <div class="match-stat-grid">
          <div class="match-stat">
            <span class="stat-value">${summary.totalTurns}</span>
            <span class="stat-label">Total Turns</span>
          </div>
          <div class="match-stat">
            <span class="stat-value">${this._formatDuration(summary.durationSeconds)}</span>
            <span class="stat-label">Duration</span>
          </div>
          <div class="match-stat">
            <span class="stat-value">${this.game.players.length}</span>
            <span class="stat-label">Players</span>
          </div>
        </div>
      `;
    }
  }

  // ============================================================
  // UI Updates
  // ============================================================

  _updatePlayerCards() {
    const container = document.getElementById('player-cards');
    if (!container || !this.game) return;

    container.innerHTML = this.game.players.map((player, i) => {
      const isCurrent = i === this.game.currentPlayerIndex && !this.game.gameOver;
      const isFinished = player.finished;

      return `
        <div class="player-card ${isCurrent ? 'active-turn' : ''} ${isFinished ? 'finished' : ''}" 
             style="--card-color: ${player.color.hex}; --card-light: ${player.color.light}">
          <div class="card-indicator" style="background: ${player.color.hex}"></div>
          <div class="card-content">
            <div class="card-name">
              ${player.name}
              ${player.isBot ? ' 🤖' : ''}
              ${isFinished ? ` 🏆 #${player.rank}` : ''}
            </div>
            <div class="card-position">
              ${isFinished ? 'Finished!' : player.position === 0 ? 'Start' : `Tile ${player.position}`}
            </div>
            <div class="card-stats">
              <span title="Snakes">🐍 ${player.stats.snakeBites}</span>
              <span title="Ladders">🪜 ${player.stats.laddersClimbed}</span>
              <span title="Sixes">⑥ ${player.stats.sixesRolled}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  _updateTurnUI() {
    if (!this.game) return;
    const player = this.game.getCurrentPlayer();
    const turnLabel = document.getElementById('turn-label');
    const rollBtn = document.getElementById('btn-roll');

    if (turnLabel && player) {
      const isMyTurnLabel = this.isOnlineMode && player.name === this.myPlayerName;
      turnLabel.textContent = isMyTurnLabel ? "Your turn" : `${player.name}'s turn`;
      turnLabel.style.color = player.color.hex;
      
      // Update turn indicator background dynamically for high-end look
      const indicator = turnLabel.parentElement;
      if (indicator) {
        indicator.style.borderLeft = `6px solid ${player.color.hex}`;
        indicator.style.background = `linear-gradient(135deg, ${player.color.light} 0%, rgba(255, 255, 255, 0.95) 100%)`;
      }
    }

    if (rollBtn) {
      const isMyTurn = !this.isOnlineMode || player?.name === this.myPlayerName;
      const isBotTurn = player?.isBot;
      rollBtn.disabled = isBotTurn || !isMyTurn || this.isProcessingTurn;
      rollBtn.textContent = isBotTurn ? '🤖 Bot thinking...' : 'Roll Dice 🎲';
    }
  }

  _updateGameLog(entry, isHistory = false) {
    if (!entry || !entry.text) return;
    const log = document.getElementById('game-log');
    if (!log) return;

    const item = document.createElement('div');
    item.className = `log-entry log-${entry.type || 'info'}`;
    item.textContent = entry.text;

    log.insertBefore(item, log.firstChild);

    // Keep only last 50 entries
    while (log.children.length > 50) {
      log.removeChild(log.lastChild);
    }

    // Cache in localStorage if not loading history
    if (!isHistory) {
      const logKey = this.isOnlineMode && this.roomCode ? `snl_log_${this.roomCode}` : 'snl_log_local';
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem(logKey) || '[]');
      } catch (e) {
        history = [];
      }
      history.push(entry);
      if (history.length > 50) {
        history = history.slice(history.length - 50);
      }
      localStorage.setItem(logKey, JSON.stringify(history));
    }
  }

  // ============================================================
  // Navigation
  // ============================================================

  _bindNavEvents() {
    document.getElementById('btn-nav-home')?.addEventListener('click', async () => {
      if (await this.confirmLeaveMatch()) {
        this.showScreen('lobby');
      }
    });
    document.getElementById('btn-nav-leaderboard')?.addEventListener('click', async () => {
      if (await this.confirmLeaveMatch()) {
        this.showScreen('leaderboard');
      }
    });
    document.getElementById('btn-mute')?.addEventListener('click', () => {
      const muted = this.sounds.toggleMute();
      const btn = document.getElementById('btn-mute');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
    });
    document.getElementById('btn-back-lobby')?.addEventListener('click', async () => {
      if (await this.confirmLeaveMatch()) {
        this.showScreen('lobby');
      }
    });
  }

  async _initLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;
    if (!this.leaderboard) {
      this.leaderboard = new LeaderboardUI(container, this.db);
    }
    await this.leaderboard.render();
  }

  // ============================================================
  // Utility Helpers
  // ============================================================

  _showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  _shake(el) {
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
  }

  _ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  _formatDuration(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ============================================================
  // Session Recovery & Leave Match Confirmation
  // ============================================================

  saveActiveSession() {
    if (this.isOnlineMode && this.roomCode) {
      localStorage.setItem('snl_active_session', JSON.stringify({
        roomCode: this.roomCode,
        myPlayerName: this.myPlayerName,
        isHost: this.isHost,
        isOnlineMode: true,
        currentScreen: this.currentScreen
      }));
      if (this.game && this.game.gameStarted && !this.game.gameOver) {
        localStorage.setItem('snl_local_game_state', JSON.stringify({
          gameState: this.game.getState(),
          localPlayers: this.localPlayers,
          currentScreen: this.currentScreen
        }));
      }
    } else if (this.game && this.game.gameStarted && !this.game.gameOver) {
      localStorage.setItem('snl_local_game_state', JSON.stringify({
        gameState: this.game.getState(),
        localPlayers: this.localPlayers,
        currentScreen: this.currentScreen
      }));
    }
  }

  async _restoreSession() {
    const onlineSessionText = localStorage.getItem('snl_active_session');
    const localGameText = localStorage.getItem('snl_local_game_state');

    if (onlineSessionText) {
      try {
        const session = JSON.parse(onlineSessionText);
        if (session && session.roomCode && session.myPlayerName) {
          this.roomCode = session.roomCode;
          this.myPlayerName = session.myPlayerName;
          this.isHost = session.isHost;
          this.isOnlineMode = true;
          
          this._setMode('online');
          this._showRoomLobby();
          this._showToast(`Rejoining room ${this.roomCode}...`);

          if (this.mp) {
            await this.mp.joinRoom(this.roomCode, this.myPlayerName);
            if (this.isHost) {
              this.mp.isHost = true;
            }
          }
        }
      } catch (e) {
        console.error("Failed to restore online session:", e);
      }
    }

    if (localGameText) {
      try {
        const localGame = JSON.parse(localGameText);
        if (localGame && localGame.gameState && localGame.localPlayers) {
          if (this.isOnlineMode) {
            if (this.isHost) {
              this.localPlayers = localGame.localPlayers;
              this.game = new GameEngine();
              this.game.loadState(localGame.gameState);
              this._initGameFromState(localGame.gameState);
            } else {
              this.showScreen('game');
              this.board = new BoardRenderer(document.getElementById('game-board'));
              this.board.render();
              this.dice = new DiceRenderer(document.getElementById('dice-container'));
              this.anims = new AnimationController(this.board);
              this._showToast("Syncing with host...");
            }
          } else {
            this.localPlayers = localGame.localPlayers;
            this.game = new GameEngine();
            this.game.loadState(localGame.gameState);
            this._initGameFromState(localGame.gameState);
            this._showToast("Local game resumed!");
          }
        }
      } catch (e) {
        console.error("Failed to restore local game:", e);
      }
    } else if (!onlineSessionText) {
      this.showScreen('lobby');
    }
  }

  async confirmLeaveMatch() {
    const isOnlineActive = this.isOnlineMode && this.roomCode;
    const isLocalActive = !this.isOnlineMode && this.game && this.game.gameStarted && !this.game.gameOver;

    if (isOnlineActive || isLocalActive) {
      const confirm = window.confirm("Are you sure you want to leave the active match?");
      if (!confirm) return false;
      
      localStorage.removeItem('snl_active_session');
      localStorage.removeItem('snl_local_game_state');
      localStorage.removeItem('snl_log_local');
      if (this.roomCode) {
        localStorage.removeItem(`snl_chat_${this.roomCode}`);
        localStorage.removeItem(`snl_log_${this.roomCode}`);
      }
      
      if (this.isOnlineMode && this.mp) {
        try {
          this.mp.sendChat(`👋 ${this.myPlayerName} has left the match.`);
          this.mp.broadcastGameState({
            type: 'player_left',
            name: this.myPlayerName,
            isHost: this.isHost
          });
          await this.mp.leaveRoom();
        } catch (e) {
          console.error(e);
        }
      }
      
      this.game = null;
      this.board = null;
      this.dice = null;
      this.anims = null;
      this.roomCode = null;
      this.localPlayers = [];
      this.isOnlineMode = false;
      
      // Force reload to get a fully clean slate back to lobby
      location.reload();
      return false; // prevent further navigation as reload handles it
    }
    return true;
  }

  // ============================================================
  // Chat Feature Implementation
  // ============================================================

  _bindChatEvents() {
    const sendBtn = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input');
    const toggleBtn = document.getElementById('btn-chat-toggle');
    const chatWrapper = document.getElementById('online-chat-wrapper');
    const closeBtn = document.getElementById('btn-chat-close');

    // Show chat panel from floating bubble
    toggleBtn?.addEventListener('click', () => {
      chatWrapper?.classList.remove('chat-hidden');
      if (toggleBtn) toggleBtn.style.display = 'none';
      this.sounds.playClick();
    });

    // Close/Hide chat button (Desktop and Mobile)
    closeBtn?.addEventListener('click', () => {
      chatWrapper?.classList.add('chat-hidden');
      if (toggleBtn) toggleBtn.style.display = 'flex';
      this.sounds.playClick();
    });

    // Send button
    sendBtn?.addEventListener('click', () => this._sendChatMessage());

    // Enter key
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._sendChatMessage();
      }
    });

    // Quick emojis
    document.querySelectorAll('.chat-quick-emojis .emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.textContent;
        this._sendChatMessage(emoji);
      });
    });
  }

  _sendChatMessage(msgText) {
    const input = document.getElementById('chat-input');
    const text = msgText || input?.value.trim();
    if (!text) return;
    
    if (this.mp) {
      this.mp.sendChat(text);
      this._addChatMessage(this.myPlayerName, text, true);
    }
    
    if (!msgText && input) {
      input.value = '';
      input.focus();
    }
  }

  _addChatMessage(sender, message, isSelf, isHistory = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
    
    const senderEl = document.createElement('span');
    senderEl.className = 'msg-sender';
    senderEl.textContent = isSelf ? 'You' : sender;
    
    const textEl = document.createElement('span');
    textEl.textContent = message;
    
    msgEl.appendChild(senderEl);
    msgEl.appendChild(textEl);
    
    container.appendChild(msgEl);
    
    // Scroll to bottom of chat
    container.scrollTop = container.scrollHeight;
    
    // Cache in localStorage if not loading history
    if (!isHistory && this.isOnlineMode && this.roomCode) {
      const chatKey = `snl_chat_${this.roomCode}`;
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem(chatKey) || '[]');
      } catch (e) {
        history = [];
      }
      history.push({ sender, message, isSelf });
      localStorage.setItem(chatKey, JSON.stringify(history));
    }

    // Play soft notification sound for received messages
    if (!isSelf && !isHistory) {
      this.sounds.playPawnHop();
    }
  }

  _restoreChatAndLogs() {
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) chatContainer.innerHTML = '';
    const logContainer = document.getElementById('game-log');
    if (logContainer) logContainer.innerHTML = '';

    // Restore chat
    if (this.isOnlineMode && this.roomCode) {
      const chatKey = `snl_chat_${this.roomCode}`;
      try {
        const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
        chatHistory.forEach(msg => {
          this._addChatMessage(msg.sender, msg.message, msg.isSelf, true);
        });
      } catch (e) {
        console.error("Failed to restore chat history:", e);
      }
    }

    // Restore log
    const logKey = this.isOnlineMode && this.roomCode ? `snl_log_${this.roomCode}` : 'snl_log_local';
    try {
      const logHistory = JSON.parse(localStorage.getItem(logKey) || '[]');
      logHistory.forEach(entry => {
        this._updateGameLog(entry, true);
      });
    } catch (e) {
      console.error("Failed to restore log history:", e);
    }
  }
}

// ============================================================
// Initialize on DOM ready
// ============================================================
const app = new App();
window.__app = app; // Expose for inline event handlers

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

