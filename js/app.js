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
    this.localPlayersCache = []; // Backing cache for local matchmaking
    this.onlinePlayersCache = []; // Backing cache for online matchmaking
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

    // Restore saved online player name
    const savedName = localStorage.getItem('snl_online_player_name');
    if (savedName) {
      const onlineInput = document.getElementById('online-name-input');
      if (onlineInput) onlineInput.value = savedName;
      const localInput = document.getElementById('player-name-input');
      if (localInput) localInput.value = savedName;
    }

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
      if (chatToggle) {
        chatToggle.style.display = isChatHidden ? 'flex' : 'none';
        if (!isChatHidden) {
          chatToggle.classList.remove('has-notification');
        }
      }
    } else {
      chat?.classList.add('hidden');
      chat?.classList.remove('chat-hidden');
      if (chatToggle) {
        chatToggle.style.display = 'none';
        chatToggle.classList.remove('has-notification');
      }
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

    // Public rooms matchmaking lobby refreshes
    document.getElementById('btn-refresh-rooms')?.addEventListener('click', () => this._loadActiveRooms(true));

    // Room visibility controls (for host)
    document.getElementById('btn-visibility-public')?.addEventListener('click', () => this._updatePrivacySetting(false));
    document.getElementById('btn-visibility-private')?.addEventListener('click', () => this._updatePrivacySetting(true));

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

    // Live name inputs synchronization (between local and online tabs)
    document.getElementById('player-name-input')?.addEventListener('input', (e) => {
      const val = e.target.value;
      const onlineInput = document.getElementById('online-name-input');
      if (onlineInput) onlineInput.value = val;
      localStorage.setItem('snl_online_player_name', val);
    });
    document.getElementById('online-name-input')?.addEventListener('input', (e) => {
      const val = e.target.value;
      const localInput = document.getElementById('player-name-input');
      if (localInput) localInput.value = val;
      localStorage.setItem('snl_online_player_name', val);
    });
  }

  _setMode(mode) {
    // Save current active player list to the previous mode's cache
    if (this.isOnlineMode) {
      this.onlinePlayersCache = [...this.localPlayers];
    } else {
      this.localPlayersCache = [...this.localPlayers];
    }

    this.isOnlineMode = mode === 'online';

    // Restore player list from the new mode's cache
    if (this.isOnlineMode) {
      this.localPlayers = [...this.onlinePlayersCache];
    } else {
      this.localPlayers = [...this.localPlayersCache];
    }

    document.getElementById('tab-local')?.classList.toggle('active', mode === 'local');
    document.getElementById('tab-online')?.classList.toggle('active', mode === 'online');
    document.getElementById('local-mode')?.classList.toggle('hidden', mode !== 'local');
    document.getElementById('online-mode')?.classList.toggle('hidden', mode !== 'online');
    this._renderPlayerList();

    if (this.isOnlineMode) {
      this._loadActiveRooms();
      this._startActiveRoomsRefreshTimer();
    } else {
      this._stopActiveRoomsRefreshTimer();
    }
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
        
        // Host can kick other players and bots, but not themselves. Local mode allows all removals.
        let showRemove = false;
        if (!this.isOnlineMode) {
          showRemove = true;
        } else if (this.isHost) {
          if (p.isBot) {
            showRemove = true;
          } else if (p.name !== this.myPlayerName) {
            showRemove = true;
          }
        }

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
    localStorage.setItem('snl_online_player_name', name);

    try {
      this.roomCode = await this.mp.createRoom(name);
      await this.db.createActiveRoom(this.roomCode, name);
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
    localStorage.setItem('snl_online_player_name', name);

    try {
      await this.mp.joinRoom(code, name);
      this._showToast("Connecting to room...");

      // Wait a short delay to check if host actually exists in this room
      setTimeout(() => {
        const presenceList = this.mp.getPresenceList();
        const host = presenceList.find(p => p.is_host);

        if (!host) {
          this._showToast("Room not found or host not present!");
          this.mp.leaveRoom().catch(console.error);
          this.roomCode = null;
          return;
        }

        this._showRoomLobby();
        this.saveActiveSession();
        this._showToast(`Joined room ${code}!`);
      }, 1200);

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
    document.getElementById('room-visibility-control')?.classList.toggle('hidden', !this.isHost);

    // Stop active rooms matchmaking refresh loop since we are in a room lobby now
    this._stopActiveRoomsRefreshTimer();

    // Default privacy visual to Public
    this._updatePrivacyUI(false);
  }

  _startActiveRoomsRefreshTimer() {
    this._stopActiveRoomsRefreshTimer();
    this._activeRoomsTimer = setInterval(() => {
      // Only refresh if we are on the lobby screen and online setup is active
      const onlineSetup = document.getElementById('online-setup');
      if (this.currentScreen === 'lobby' && onlineSetup && !onlineSetup.classList.contains('hidden')) {
        this._loadActiveRooms();
      }
    }, 5000);
  }

  _stopActiveRoomsRefreshTimer() {
    if (this._activeRoomsTimer) {
      clearInterval(this._activeRoomsTimer);
      this._activeRoomsTimer = null;
    }
  }

  async _loadActiveRooms(manual = false) {
    const container = document.getElementById('rooms-list-container');
    const refreshBtn = document.getElementById('btn-refresh-rooms');
    if (!container) return;

    if (manual && refreshBtn) {
      refreshBtn.classList.add('spinning');
      this.sounds.playClick();
      setTimeout(() => refreshBtn.classList.remove('spinning'), 800);
    }

    try {
      const rooms = await this.db.getActiveRooms();
      container.innerHTML = '';

      if (!rooms || rooms.length === 0) {
        container.innerHTML = `<div class="empty-list" style="padding: 16px; font-size: 0.85rem;">No active public rooms. Create one to start!</div>`;
        return;
      }

      rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'lobby-room-item';
        item.innerHTML = `
          <div class="lobby-room-host">
            <span>👋</span>
            <span style="font-weight: 800;">${room.host_name}'s room</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="lobby-room-code-badge">${room.room_code}</span>
            <span class="lobby-room-census">${room.player_count}/${room.max_players}</span>
            <button class="btn btn-secondary btn-join-quick" data-code="${room.room_code}" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 8px;">Join</button>
          </div>
        `;

        // Bind quick join button
        item.querySelector('.btn-join-quick')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const nameInput = document.getElementById('online-name-input');
          const codeInput = document.getElementById('join-code-input');
          if (nameInput && !nameInput.value.trim()) {
            this._shake(nameInput);
            this._showToast('Please enter your name first!');
            return;
          }
          if (codeInput) {
            codeInput.value = room.room_code;
            this._joinRoom();
          }
        });

        container.appendChild(item);
      });
    } catch (e) {
      console.warn('Failed to load active rooms:', e);
    }
  }

  async _updatePrivacySetting(isPrivate) {
    if (!this.isHost || !this.roomCode) return;
    this.sounds.playClick();

    try {
      // 1. Update in active_rooms database
      await this.db.updateActiveRoomPrivacy(this.roomCode, isPrivate);

      // 2. Broadcast to all clients in the channel
      if (this.mp) {
        this.mp.broadcastGameState({
          type: 'privacy_update',
          isPrivate: isPrivate
        });
      }

      // 3. Update local UI
      this._updatePrivacyUI(isPrivate);
      this._showToast(`Room is now ${isPrivate ? '🔒 Private' : '🔓 Public'}`);
    } catch (e) {
      console.error('Error updating room privacy:', e);
    }
  }

  _updatePrivacyUI(isPrivate) {
    const pubBtn = document.getElementById('btn-visibility-public');
    const privBtn = document.getElementById('btn-visibility-private');
    const badge = document.getElementById('room-privacy-badge');

    if (pubBtn && privBtn) {
      pubBtn.classList.toggle('active', !isPrivate);
      privBtn.classList.toggle('active', isPrivate);
    }

    if (badge) {
      badge.textContent = isPrivate ? '🔒 Private' : '🔓 Public';
      badge.className = `room-privacy-badge ${isPrivate ? 'private' : 'public'}`;
    }
  }

  _triggerChatNotificationDot() {
    const chatWrapper = document.getElementById('online-chat-wrapper');
    const toggleBtn = document.getElementById('btn-chat-toggle');
    
    // Check if chat is closed/collapsed
    const isChatHidden = !chatWrapper || chatWrapper.classList.contains('chat-hidden') || chatWrapper.classList.contains('hidden');
    
    if (isChatHidden && toggleBtn) {
      toggleBtn.classList.add('has-notification');
      this.sounds.playPawnHop(); // Subtle sound alert
    }
  }

  _setupMultiplayerCallbacks() {
    if (!this.mp) return;

    this.mp.onPresenceSync = (state) => {
      // Update player list from presence while preserving any active bots
      const players = Object.values(state).flat();
      
      // Filter out duplicate player names to prevent double-rendering during reconnects or presence latency
      const uniquePlayers = [];
      const seenNames = new Set();
      for (const p of players) {
        if (p.name && !seenNames.has(p.name.toLowerCase())) {
          seenNames.add(p.name.toLowerCase());
          uniquePlayers.push(p);
        }
      }

      const bots = this.localPlayers.filter(p => p.isBot);
      
      const humanPlayers = uniquePlayers.map(p => ({
        name: p.name,
        isBot: false
      }));

      this.localPlayers = [...humanPlayers, ...bots];
      this._renderPlayerList();

      // Check if there is currently an active host in the presence list
      const hasHost = players.some(p => p.is_host);

      if (hasHost) {
        clearTimeout(this._hostElectionTimer);
      }

      // If the host has left/disconnected, elect a new host from remaining players after a 2.5s grace period (prevents dual-host race conditions on browser refreshes)
      if (!hasHost && players.length > 0) {
        clearTimeout(this._hostElectionTimer);
        this._hostElectionTimer = setTimeout(() => {
          if (!this.mp || !this.mp.channel) return;
          
          const freshPresences = Object.values(this.mp.channel.presenceState()).flat();
          const hasHostNow = freshPresences.some(p => p.is_host);

          if (!hasHostNow && freshPresences.length > 0) {
            // Filter unique names
            const unique = [];
            const seen = new Set();
            for (const p of freshPresences) {
              if (p.name && !seen.has(p.name.toLowerCase())) {
                seen.add(p.name.toLowerCase());
                unique.push(p);
              }
            }

            // Sort players by joined_at ascending to find the oldest remaining player
            const sorted = [...unique].sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
            const newHost = sorted[0];

            if (newHost && newHost.user_id === this.mp.myId) {
              // We are elected as the new Host!
              this.isHost = true;
              this.mp.isHost = true;

              // Update database active matchmaking lobby row
              if (this.roomCode) {
                this.db.updateActiveRoomHost(this.roomCode, this.myPlayerName).catch(console.error);
                this.db.updateActiveRoomPlayerCount(this.roomCode, this.localPlayers.length).catch(console.error);
              }

              // Re-announce presence as Host so other clients detect us
              this.mp.channel.track({
                user_id: this.mp.myId,
                name: this.myPlayerName,
                is_host: true,
                joined_at: newHost.joined_at // preserve our original join timestamp
              }).catch(console.error);

              // Update lobby controls view
              this._showRoomLobby();
              this._updateTurnUI();

              this._showToast("👑 You are now the room owner!");
              this._updateGameLog({
                text: `👑 ${this.myPlayerName} is now the room owner!`,
                type: 'system'
              });

              // Broadcast chat announcement
              this.mp.sendChat(`📢 I am now the room owner!`);
            }
          }
        }, 2500);
      }

      // If host, debounce lobby broadcast and database rooms sync to avoid rapid-fire updates
      if (this.isHost) {
        clearTimeout(this._lobbySyncTimer);
        this._lobbySyncTimer = setTimeout(async () => {
          this.mp.broadcastGameState({
            type: 'lobby_update',
            players: this.localPlayers
          });

          // Also update active matchmaking lobby player counts
          if (this.roomCode) {
            const count = this.localPlayers.length;
            await this.db.updateActiveRoomPlayerCount(this.roomCode, count);
          }
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
      } else if (!this.isHost && data.type === 'back_to_lobby') {
        this.showScreen('lobby');
        this._setMode('online');
        this._showRoomLobby();
        this.localPlayers = data.players || [];
        this._renderPlayerList();

        // Clear logs and chat UI for clean slate
        const log = document.getElementById('game-log');
        if (log) log.innerHTML = '';
        const chat = document.getElementById('chat-messages');
        if (chat) chat.innerHTML = '';
      } else if (data.type === 'player_left') {
        this._showToast(`🚫 ${data.name} has left the match.`);
        this._updateGameLog({
          text: `🚫 ${data.name} has left the match.`,
          type: 'warning'
        });

        // Handle in-game player disconnect/leave gracefully
        if (this.game && this.game.gameStarted && !this.game.gameOver) {
          this._handleInGamePlayerLeave(data.name);
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
      } else if (!this.isHost && data.type === 'privacy_update') {
        this._updatePrivacyUI(data.isPrivate);
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
      this._triggerChatNotificationDot();
    };

    this.mp.onPlayerJoin = (player) => {
      if (player.name && player.name !== this.myPlayerName) {
        this._showToast(`👋 ${player.name} joined the room!`);
        this._triggerChatNotificationDot();
      }
    };

    this.mp.onPlayerLeave = (player) => {
      if (player.name && player.name !== this.myPlayerName) {
        this._showToast(`🚪 ${player.name} left the room!`);
        this._triggerChatNotificationDot();

        // Gracefully handle player connection drop or exit inside an active match
        if (this.game && this.game.gameStarted && !this.game.gameOver) {
          this._showToast(`🚫 ${player.name} has left the match.`);
          this._updateGameLog({
            text: `🚫 ${player.name} has left the match.`,
            type: 'warning'
          });
          this._handleInGamePlayerLeave(player.name);
        }
      }
    };
  }

  async _startOnlineGame() {
    if (!this.isHost) return;
    if (this.roomCode) {
      await this.db.deleteActiveRoom(this.roomCode);
    }
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

        // Trigger bot turn if first player is a bot
        const firstPlayer = this.game.getCurrentPlayer();
        if (firstPlayer && firstPlayer.isBot) {
          if (!this.isOnlineMode || this.isHost) {
            this.bot.takeTurn(firstPlayer, () => this._onRollDice(), this.isOnlineMode);
          }
        }
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

        // Trigger bot turn if first player is a bot
        const firstPlayer = this.game.getCurrentPlayer();
        if (firstPlayer && firstPlayer.isBot) {
          if (!this.isOnlineMode || this.isHost) {
            this.bot.takeTurn(firstPlayer, () => this._onRollDice(), this.isOnlineMode);
          }
        }
      });
    });
  }

  // ============================================================
  // Game Events
  // ============================================================

  _bindGameEvents() {
    document.getElementById('btn-roll')?.addEventListener('click', () => this._onRollDice());

    // Keyboard shortcut for desktop: Space bar to roll dice
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.code === 'Space') {
        const rollBtn = document.getElementById('btn-roll');
        const activeEl = document.activeElement;
        const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        // Only trigger roll if button is visible, enabled, and player is not typing in a text field
        if (rollBtn && !rollBtn.disabled && !isInputActive) {
          e.preventDefault(); // Prevent page scrolling down
          rollBtn.click();
        }
      }
    });

    // Results screen buttons
    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      // Clear local logs and chat UI for clean slate
      const log = document.getElementById('game-log');
      if (log) log.innerHTML = '';
      const chat = document.getElementById('chat-messages');
      if (chat) chat.innerHTML = '';
      
      if (this.roomCode) {
        localStorage.removeItem(`snl_chat_${this.roomCode}`);
        localStorage.removeItem(`snl_log_${this.roomCode}`);
      }
      localStorage.removeItem('snl_log_local');

      if (this.isOnlineMode && this.mp) {
        this.showScreen('lobby');
        this._setMode('online');
        this._showRoomLobby();

        // Restore human players from active Presence
        const presencePlayers = this.mp.getPresenceList();
        this.localPlayers = presencePlayers.map(p => ({
          name: p.name,
          isBot: false
        }));
        this._renderPlayerList();

        // Broadcast to all other players to go back to the lobby
        if (this.isHost) {
          this.mp.broadcastGameState({
            type: 'back_to_lobby',
            players: this.localPlayers
          });
        }
      } else {
        this.showScreen('lobby');
        this._setMode('local');
        this._renderPlayerList();
      }
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

    // Execute move
    const result = this.game.executeMove(diceValue);

    // Broadcast state in online mode (use minimal payload for speed) immediately to eliminate opponent lag
    if (this.isOnlineMode && this.mp) {
      this.mp.broadcastDiceRoll({
        diceValue,
        result,
        doubleSix: this.game.consecutiveSixes === 2,
        gs: this.game.getMinimalState()
      });
    }

    // Animate dice
    this.sounds.playDiceRoll();
    await this.dice.roll(diceValue);

    // Log the roll
    this._updateGameLog({
      text: `🎲 ${currentPlayer.name} rolled a ${diceValue}`,
      type: 'roll'
    });

    // Handle double 6 confetti trigger
    if (this.game.consecutiveSixes === 2) {
      this._updateGameLog({
        text: `🔥 Double 6! ${currentPlayer.name} is on fire!`,
        type: 'bonus'
      });
      this.sounds.playExtraTurn();
      this.anims.celebrateDoubleSix();
    }

    if (result) {
      // Animate pawn movement
      if (result.moved && result.steps.length > 0) {
        const pawn = this.board.getPawnElement(result.playerId);
        
        await this.anims.hopPawn(pawn, result.from, result.steps, () => {
          this.sounds.playPawnHop();
        });

        // Snake animation
        if (result.snake) {
          this._triggerFloatingFeedback('snake', currentPlayer.color.hex, currentPlayer.name);
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
          this._triggerFloatingFeedback('ladder', currentPlayer.color.hex, currentPlayer.name);
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
        this._triggerFloatingFeedback('penalty', currentPlayer.color.hex, currentPlayer.name);
        this._updateGameLog({
          text: `⚠️ ${currentPlayer.name} rolled three 6s in a row! Back to start!`,
          type: 'warning'
        });

        // Visual penalty slide back and shake/flash animation
        const pawn = this.board.getPawnElement(result.playerId);
        if (pawn) {
          pawn.classList.add('penalty-reset');
          this.sounds.playSnakeHiss(); // Play bad luck slide sound
          
          const idx = parseInt(pawn.dataset.playerIndex) || 0;
          const boardHeight = this.board.boardRect?.height || 500;
          const startX = 30 + idx * 24;
          const startY = boardHeight + 20;
          
          // Slide the pawn back to the start zone beautifully
          await this.anims._animateMoveTo(pawn, startX, startY, 1000, 'cubic-bezier(0.25, 0.8, 0.25, 1)');
          
          // Let it shake and flash at start zone for 1.2s so player knows exactly where they are
          await this.anims._wait(1200);
          pawn.classList.remove('penalty-reset');
        }
      }

      // Extra turn notification
      if (result.extraTurn && !result.win) {
        this._triggerFloatingFeedback('extra', currentPlayer.color.hex, currentPlayer.name);
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

        // Show personalized splendid floating cartoon banner immediately
        let endBannerText = `${currentPlayer.name} WINS! 🏆`;
        let endBannerType = 'extra';
        if (this.isOnlineMode) {
          const isMe = currentPlayer.name === this.myPlayerName;
          endBannerText = isMe ? "VICTORY! 🏆" : "DEFEAT! 💀";
          endBannerType = isMe ? "extra" : "penalty";
        }
        this._showFloatingFeedback(endBannerText, endBannerType, currentPlayer.color.hex);

        this.sounds.playWinFanfare();
        await this.anims.celebrateWin(currentPlayer.color.hex);
      }

      // Update board positions
      this.board.updatePawnPositions(this.game.players);
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
        this.bot.takeTurn(nextPlayer, () => this._onRollDice(), this.isOnlineMode);
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

    // Handle remote double 6 confetti trigger
    if (data.doubleSix) {
      this._updateGameLog({
        text: `🔥 Double 6! ${roller.name} is on fire!`,
        type: 'bonus'
      });
      this.anims.celebrateDoubleSix();
    }

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
          this._triggerFloatingFeedback('snake', roller.color.hex, roller.name);
          this._updateGameLog({
            text: `🐍 ${roller.name} got bitten! Slides from ${result.snake.from} to ${result.snake.to}`,
            type: 'snake'
          });
          this.sounds.playSnakeHiss();
          await this.anims.slideSnake(pawn, result.snake.from, result.snake.to);
        }
        if (result.ladder) {
          this._triggerFloatingFeedback('ladder', roller.color.hex, roller.name);
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
      this._triggerFloatingFeedback('penalty', roller.color.hex, roller.name);
      this._updateGameLog({
        text: `⚠️ ${roller.name} rolled three 6s in a row! Back to start!`,
        type: 'warning'
      });

      // Visual penalty slide back and shake/flash animation
      const pawn = this.board.getPawnElement(result.playerId);
      if (pawn) {
        pawn.classList.add('penalty-reset');
        this.sounds.playSnakeHiss(); // Play bad luck slide sound
        
        const idx = parseInt(pawn.dataset.playerIndex) || 0;
        const boardHeight = this.board.boardRect?.height || 500;
        const startX = 30 + idx * 24;
        const startY = boardHeight + 20;
        
        // Slide the pawn back to the start zone beautifully
        await this.anims._animateMoveTo(pawn, startX, startY, 1000, 'cubic-bezier(0.25, 0.8, 0.25, 1)');
        
        // Let it shake and flash at start zone for 1.2s so player knows exactly where they are
        await this.anims._wait(1200);
        pawn.classList.remove('penalty-reset');
      }
    }

    if (result.extraTurn && !result.win) {
      this._triggerFloatingFeedback('extra', roller.color.hex, roller.name);
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

      // Show personalized splendid floating cartoon banner immediately
      let endBannerText = `${roller.name} WINS! 🏆`;
      let endBannerType = 'extra';
      if (this.isOnlineMode) {
        const isMe = roller.name === this.myPlayerName;
        endBannerText = isMe ? "VICTORY! 🏆" : "DEFEAT! 💀";
        endBannerType = isMe ? "extra" : "penalty";
      }
      this._showFloatingFeedback(endBannerText, endBannerType, roller.color.hex);

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

      // Trigger bot turn if next player is a bot (only host executes bot moves in online mode)
      const nextPlayer = this.game.getCurrentPlayer();
      if (nextPlayer && nextPlayer.isBot) {
        if (!this.isOnlineMode || this.isHost) {
          this.bot.takeTurn(nextPlayer, () => this._onRollDice(), this.isOnlineMode);
        }
      }
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

    // Dynamic Victory/Defeat cartoon banner updates on results screen
    const resultsTitle = document.querySelector('.results-title');
    if (resultsTitle) {
      if (this.isOnlineMode) {
        const iWon = this.game.winners[0]?.name === this.myPlayerName;
        resultsTitle.textContent = iWon ? "🏆 Victory!" : "💀 Defeat!";
        resultsTitle.style.color = iWon ? "#4CAF50" : "#FF7043";
      } else {
        const winner = this.game.winners[0];
        resultsTitle.textContent = `🏆 ${winner?.name || 'Player'} Wins!`;
        if (winner?.color) resultsTitle.style.color = winner.color.hex;
      }
    }

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

      // Update 3D dice color theme dynamically to match the active player's color
      if (this.dice && player.color) {
        const isYellow = player.color.hex.toLowerCase() === '#fdd835';
        const dotColor = isYellow ? '#1A237E' : '#FFFFFF';
        
        // Calculate a matching soft glowing shade for the border outline
        let borderColor = 'rgba(255, 255, 255, 0.4)';
        const hex = player.color.hex.toLowerCase();
        if (hex === '#e53935') borderColor = '#ff8a80';      // Soft glow red
        else if (hex === '#1e88e5') borderColor = '#80d8ff'; // Soft glow blue
        else if (hex === '#43a047') borderColor = '#b9f6ca'; // Soft glow green
        else if (hex === '#fdd835') borderColor = '#ffe57f'; // Soft glow yellow

        const container = document.getElementById('dice-container');
        if (container) {
          container.style.setProperty('--dice-bg', player.color.hex);
          container.style.setProperty('--dice-border', borderColor);
          container.style.setProperty('--dice-dot-color', dotColor);
        }
      }
    }

    if (rollBtn) {
      const isMyTurn = !this.isOnlineMode || player?.name === this.myPlayerName;
      const isBotTurn = player?.isBot;
      rollBtn.disabled = isBotTurn || !isMyTurn || this.isProcessingTurn;
      rollBtn.textContent = isBotTurn ? '🤖 Bot thinking...' : 'Roll Dice 🎲';
    }
  }

  _triggerFloatingFeedback(type, playerHex, playerName) {
    const ladders = ["SPLENDID! 🪜", "AWESOME! 🪜", "WOOHOO! 🪜", "SOARING! 🪜", "CLIMBING! 🪜", "UP WE GO! 🪜", "LUCKY LEAP! 🪜"];
    const snakes = ["OH NO! 🐍", "OUCH! 🐍", "SLITHERED! 🐍", "WHOOPS! 🐍", "WATCH OUT! 🐍", "DOWNWARD! 🐍", "SNAKE BITE! 🐍"];
    const extraTurns = ["LUCKY 6! 🎲", "EXTRA TURN! 🎉", "ON FIRE! 🔥", "BOOM! ⚡", "ROLL AGAIN! 🎲"];
    const penalties = ["UNLUCKY! ⚠️", "TRIPLE SIX! 💀", "BACK TO START! 😭", "OH MY! 💀"];

    let phrases = [];
    if (type === 'ladder') phrases = ladders;
    else if (type === 'snake') phrases = snakes;
    else if (type === 'extra') phrases = extraTurns;
    else if (type === 'penalty') phrases = penalties;
    else return;

    const text = phrases[Math.floor(Math.random() * phrases.length)];
    this._showFloatingFeedback(text, type, playerHex);
  }

  _showFloatingFeedback(text, type, playerHex = '#3F51B5') {
    const banner = document.createElement('div');
    banner.className = `floating-feedback ${type}`;
    
    // Choose beautiful gradient base styling
    let backgroundStyle = `linear-gradient(135deg, ${playerHex} 0%, #1A237E 100%)`;
    if (type === 'snake') {
      backgroundStyle = `linear-gradient(135deg, ${playerHex} 0%, #FF7043 100%)`;
    } else if (type === 'extra') {
      backgroundStyle = `linear-gradient(135deg, ${playerHex} 0%, #00B894 100%)`;
    } else if (type === 'penalty') {
      backgroundStyle = `linear-gradient(135deg, #FF7043 0%, #1A237E 100%)`;
    }

    banner.style.background = backgroundStyle;
    banner.style.border = `4px solid white`;
    banner.innerHTML = `<span class="feedback-text" style="color: white; text-shadow: 0 4px 8px rgba(0,0,0,0.45);">${text}</span>`;
    
    document.body.appendChild(banner);
    
    // Play transition swoosh sound
    this.sounds.playExtraTurn();

    // Swoosh out after 1.2s
    setTimeout(() => {
      banner.classList.add('swoosh-out');
      setTimeout(() => {
        banner.remove();
      }, 350);
    }, 1200);
  }

  _handleInGamePlayerLeave(playerName) {
    if (!this.game) return;
    const player = this.game.players.find(p => p.name === playerName);
    if (!player) return;

    const totalPlayersBefore = this.game.players.length;

    if (totalPlayersBefore <= 2) {
      // 2 players: Match over! Remaining player wins by forfeit
      const remainingPlayer = this.game.players.find(p => p.id !== player.id);
      if (remainingPlayer) {
        remainingPlayer.finished = true;
        remainingPlayer.rank = 1;
        this.game.winners = [remainingPlayer];
        this.game.gameOver = true;
        this.game.endTime = new Date();

        this._updateGameLog({
          text: `🏆 ${remainingPlayer.name} wins by forfeit as ${playerName} left!`,
          type: 'win'
        });

        // Remove leaving player's pawn from DOM
        const pawn = this.board.getPawnElement(player.id);
        if (pawn) pawn.remove();
        delete this.board.pawnElements[player.id];

        // Re-index remaining pawn index
        this.game.players.forEach((p, idx) => {
          const pawnEl = this.board.getPawnElement(p.id);
          if (pawnEl) pawnEl.dataset.playerIndex = idx;
        });
        this.board.updatePawnPositions(this.game.players);

        this._updatePlayerCards();
        this.saveActiveSession();

        // Show personalized splendid floating cartoon banner immediately
        let endBannerText = `${remainingPlayer.name} WINS! 🏆`;
        let endBannerType = 'extra';
        if (this.isOnlineMode) {
          const isMe = remainingPlayer.name === this.myPlayerName;
          endBannerText = isMe ? "VICTORY (FORFEIT)! 🏆" : "DEFEAT! 💀";
          endBannerType = isMe ? "extra" : "penalty";
        }
        this._showFloatingFeedback(endBannerText, endBannerType, remainingPlayer.color.hex);

        // Trigger win celebration
        this.sounds.playWinFanfare();
        this.anims.celebrateWin(remainingPlayer.color.hex);
        setTimeout(() => this._handleGameOver(), 2000);
      }
    } else {
      // 3 or 4 players: Remove player, adjust turn schedules, and continue match
      const activePlayerBefore = this.game.getCurrentPlayer();
      const leavingIndex = this.game.players.findIndex(p => p.id === player.id);

      // Remove player
      this.game.removePlayer(player.id);

      // Update localPlayers list
      this.localPlayers = this.game.players.map(p => ({
        name: p.name,
        isBot: p.isBot
      }));

      // Adjust currentPlayerIndex to keep it on the correct player
      if (activePlayerBefore) {
        if (activePlayerBefore.id === player.id) {
          // If it was the leaving player's turn, advance to next player
          let nextIndex = leavingIndex % this.game.players.length;
          let safety = 0;
          while (this.game.players[nextIndex].finished && safety < this.game.players.length) {
            nextIndex = (nextIndex + 1) % this.game.players.length;
            safety++;
          }
          this.game.currentPlayerIndex = nextIndex;
        } else {
          // Find the new index of the active player
          const newIdx = this.game.players.findIndex(p => p.id === activePlayerBefore.id);
          if (newIdx !== -1) {
            this.game.currentPlayerIndex = newIdx;
          }
        }
      }

      // Re-index all pawns, update styles and initials text to match new color assignments
      this.game.players.forEach((p, idx) => {
        const pawnEl = this.board.getPawnElement(p.id);
        if (pawnEl) {
          pawnEl.dataset.playerIndex = idx;
          pawnEl.style.setProperty('--pawn-color', p.color.hex);
          pawnEl.style.setProperty('--pawn-light', p.color.light);
          pawnEl.textContent = p.name.charAt(0).toUpperCase();
        }
      });

      // Update positions and UI views
      this.board.updatePawnPositions(this.game.players);
      this._updatePlayerCards();
      this._updateTurnUI();
      this.saveActiveSession();

      // If host, broadcast the updated state so clients sync up instantly
      if (this.isOnlineMode && this.isHost && this.mp) {
        this.mp.broadcastGameState(this.game.getState());
      }

      // Trigger bot turn if active turn is a bot
      const nextPlayer = this.game.getCurrentPlayer();
      if (nextPlayer && nextPlayer.isBot) {
        if (!this.isOnlineMode || this.isHost) {
          this.bot.takeTurn(nextPlayer, () => this._onRollDice(), this.isOnlineMode);
        }
      }
    }
  }

  _updateGameLog(entry, isHistory = false) {
    if (!entry || !entry.text) return;
    const log = document.getElementById('game-log');
    if (!log) return;

    const item = document.createElement('div');
    item.className = `log-entry log-${entry.type || 'info'}`;
    item.textContent = entry.text;

    // Apply exact player color styles dynamically
    if (this.game && this.game.players) {
      let parsedHtml = entry.text;
      let matchedPlayer = null;

      for (const p of this.game.players) {
        if (!p.name) continue;
        const escapedName = p.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
        if (regex.test(entry.text)) {
          matchedPlayer = p;
          parsedHtml = parsedHtml.replace(regex, `<span class="log-player-name" style="color: ${p.color.hex}; font-weight: 800;">${p.name}</span>`);
        }
      }

      if (matchedPlayer) {
        item.innerHTML = parsedHtml;
        item.style.borderLeft = `4px solid ${matchedPlayer.color.hex}`;
        item.style.background = `linear-gradient(90deg, ${matchedPlayer.color.light}33 0%, rgba(255, 255, 255, 0.4) 100%)`;
      }
    }

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
          const presenceList = this.mp.getPresenceList();
          const remainingCount = presenceList.filter(p => p.user_id !== this.mp.myId).length;

          if (remainingCount === 0) {
            // Room is empty: remove it completely!
            await this.db.deleteActiveRoom(this.roomCode);
          } else if (this.isHost) {
            // Host is leaving but players remain: handover database row to the next owner
            const sorted = [...presenceList]
              .filter(p => p.user_id !== this.mp.myId)
              .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
            const newHost = sorted[0];
            if (newHost) {
              await this.db.updateActiveRoomHost(this.roomCode, newHost.name).catch(console.error);
              await this.db.updateActiveRoomPlayerCount(this.roomCode, remainingCount).catch(console.error);
            }
          } else {
            // Normal player leaves: update room player count
            await this.db.updateActiveRoomPlayerCount(this.roomCode, remainingCount).catch(console.error);
          }

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
      
      if (this.isOnlineMode) {
        this.roomCode = null;
        this.localPlayers = [];
        this.onlinePlayersCache = [];
        
        // Reset room-lobby and online-setup visibility
        document.getElementById('room-lobby')?.classList.add('hidden');
        document.getElementById('online-setup')?.classList.remove('hidden');
        this.showScreen('lobby');
        this._setMode('online');
        return false;
      } else {
        this.roomCode = null;
        this.localPlayers = [];
        this.isOnlineMode = false;
        
        // Force reload to get a fully clean slate back to lobby for local games
        location.reload();
        return false; // prevent further navigation as reload handles it
      }
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
      if (toggleBtn) {
        toggleBtn.style.display = 'none';
        toggleBtn.classList.remove('has-notification');
      }
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

