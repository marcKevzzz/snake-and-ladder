// ============================================================
// Multiplayer Manager — Supabase Realtime Rooms
// ============================================================

export class MultiplayerManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.channel = null;
    this.roomCode = null;
    this.isHost = false;
    this.myId = null;
    this.myName = null;

    // Callbacks
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onGameUpdate = null;
    this.onGameStart = null;
    this.onPresenceSync = null;
    this.onChatMessage = null;
  }

  /** Generate a short room code */
  _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /**
   * Create a new room as host.
   * @param {string} playerName - Host player name
   * @returns {string} Room code
   */
  async createRoom(playerName) {
    this.roomCode = this._generateRoomCode();
    this.isHost = true;
    this.myId = crypto.randomUUID();
    this.myName = playerName;

    await this._joinChannel();
    return this.roomCode;
  }

  /**
   * Join an existing room.
   * @param {string} roomCode - Room code to join
   * @param {string} playerName - Player name
   * @returns {boolean} Success
   */
  async joinRoom(roomCode, playerName) {
    this.roomCode = roomCode.toUpperCase();
    this.isHost = false;
    this.myId = crypto.randomUUID();
    this.myName = playerName;

    await this._joinChannel();
    return true;
  }

  /** Set up the Supabase Realtime channel */
  async _joinChannel() {
    if (!this.supabase) {
      console.warn('No Supabase client — multiplayer not available');
      return;
    }

    // Clean up existing channel
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
    }

    this.channel = this.supabase.channel(`room:${this.roomCode}`, {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: this.myId }
      }
    });

    // Listen for game state broadcasts
    this.channel.on('broadcast', { event: 'game_update' }, (payload) => {
      if (this.onGameUpdate) {
        this.onGameUpdate(payload.payload);
      }
    });

    this.channel.on('broadcast', { event: 'game_start' }, (payload) => {
      if (this.onGameStart) {
        this.onGameStart(payload.payload);
      }
    });

    this.channel.on('broadcast', { event: 'dice_roll' }, (payload) => {
      if (this.onGameUpdate) {
        this.onGameUpdate({ type: 'dice_roll', ...payload.payload });
      }
    });

    this.channel.on('broadcast', { event: 'chat' }, (payload) => {
      if (this.onChatMessage) {
        this.onChatMessage(payload.payload);
      }
    });

    // Listen for presence changes
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      if (this.onPresenceSync) {
        this.onPresenceSync(state);
      }
    });

    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (this.onPlayerJoin) {
        newPresences.forEach(p => this.onPlayerJoin(p));
      }
    });

    this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (this.onPlayerLeave) {
        leftPresences.forEach(p => this.onPlayerLeave(p));
      }
    });

    // Subscribe and announce presence
    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel.track({
          user_id: this.myId,
          name: this.myName,
          is_host: this.isHost,
          joined_at: new Date().toISOString()
        });
      }
    });
  }

  /** Broadcast game state to all players */
  broadcastGameState(state) {
    if (!this.channel) return;
    return this.channel.send({
      type: 'broadcast',
      event: 'game_update',
      payload: state
    });
  }

  /** Broadcast game start event */
  broadcastGameStart(gameState) {
    if (!this.channel) return;
    return this.channel.send({
      type: 'broadcast',
      event: 'game_start',
      payload: gameState
    });
  }

  /** Broadcast a dice roll result (minimal payload for speed) */
  broadcastDiceRoll(rollData) {
    if (!this.channel) return;
    return this.channel.send({
      type: 'broadcast',
      event: 'dice_roll',
      payload: rollData
    });
  }

  /** Send a chat message */
  sendChat(message) {
    if (!this.channel) return;
    return this.channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: {
        from: this.myName,
        message,
        ts: Date.now()
      }
    });
  }

  /** Get list of players in the room */
  getPresenceList() {
    if (!this.channel) return [];
    const state = this.channel.presenceState();
    return Object.values(state).flat();
  }

  /** Leave the current room */
  async leaveRoom() {
    if (this.channel) {
      await this.channel.untrack();
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.roomCode = null;
    this.isHost = false;
  }

  /** Check if online multiplayer is available */
  get isAvailable() {
    return !!this.supabase;
  }
}
