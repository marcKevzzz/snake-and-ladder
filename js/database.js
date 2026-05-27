// ============================================================
// Database — Supabase / LocalStorage Operations
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export class Database {
  constructor() {
    this.supabase = null;
    this.isOnline = false;

    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
      try {
        this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.isOnline = true;
        console.log('✅ Supabase connected');
      } catch (e) {
        console.warn('⚠️ Supabase connection failed, using local storage:', e);
      }
    } else {
      console.log('📦 Running in local mode (no Supabase configured)');
    }
  }

  /** Get Supabase client (for multiplayer) */
  getClient() {
    return this.supabase;
  }

  // ============================================================
  // Player Operations
  // ============================================================

  /** Get or create a player by name */
  async getOrCreatePlayer(name) {
    if (this.isOnline) {
      try {
        // Try to find existing player
        let { data } = await this.supabase
          .from('players')
          .select('*')
          .ilike('name', name)
          .limit(1)
          .single();

        if (data) return data;

        // Create new player
        const { data: newPlayer, error } = await this.supabase
          .from('players')
          .insert({ name })
          .select()
          .single();

        if (error) throw error;
        return newPlayer;
      } catch (e) {
        console.warn('DB getOrCreatePlayer error:', e);
      }
    }

    // Local storage fallback
    const players = this._getLocalData('players');
    let player = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (!player) {
      player = {
        id: crypto.randomUUID(),
        name,
        wins: 0, losses: 0, games_played: 0,
        total_snakes_hit: 0, total_ladders_climbed: 0, total_sixes_rolled: 0,
        created_at: new Date().toISOString()
      };
      players.push(player);
      this._setLocalData('players', players);
    }
    return player;
  }

  /** Update player stats after a match — auto-creates player if not found */
  async updatePlayerStats(name, stats) {
    // Ensure player exists first
    await this.getOrCreatePlayer(name);

    if (this.isOnline) {
      try {
        const { data: player } = await this.supabase
          .from('players')
          .select('*')
          .ilike('name', name)
          .limit(1)
          .single();

        if (player) {
          await this.supabase
            .from('players')
            .update({
              wins: player.wins + (stats.won ? 1 : 0),
              losses: player.losses + (stats.won ? 0 : 1),
              games_played: player.games_played + 1,
              total_snakes_hit: player.total_snakes_hit + (stats.snakeBites || 0),
              total_ladders_climbed: player.total_ladders_climbed + (stats.laddersClimbed || 0),
              total_sixes_rolled: player.total_sixes_rolled + (stats.sixesRolled || 0),
              updated_at: new Date().toISOString()
            })
            .eq('id', player.id);
        }
      } catch (e) {
        console.warn('DB updatePlayerStats error:', e);
      }
      return;
    }

    // Local fallback
    const players = this._getLocalData('players');
    const player = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (player) {
      player.wins += stats.won ? 1 : 0;
      player.losses += stats.won ? 0 : 1;
      player.games_played += 1;
      player.total_snakes_hit += stats.snakeBites || 0;
      player.total_ladders_climbed += stats.laddersClimbed || 0;
      player.total_sixes_rolled += stats.sixesRolled || 0;
      this._setLocalData('players', players);
    }
  }

  // ============================================================
  // Match Operations
  // ============================================================

  /** Save a completed match */
  async saveMatch(matchData) {
    const matchRecord = {
      room_code: matchData.roomCode || 'LOCAL',
      winner_name: matchData.winnerName,
      num_players: matchData.numPlayers,
      num_bots: matchData.numBots || 0,
      total_turns: matchData.totalTurns,
      started_at: matchData.startedAt,
      ended_at: new Date().toISOString(),
      duration_seconds: matchData.durationSeconds
    };

    if (this.isOnline) {
      try {
        const { data: match, error } = await this.supabase
          .from('matches')
          .insert(matchRecord)
          .select()
          .single();

        if (error) throw error;

        // Save match players
        if (match && matchData.players) {
          const playerRecords = matchData.players.map(p => ({
            match_id: match.id,
            player_name: p.name,
            is_bot: p.isBot,
            final_position: p.position,
            finish_rank: p.rank,
            snakes_hit: p.stats?.snakeBites || 0,
            ladders_climbed: p.stats?.laddersClimbed || 0,
            sixes_rolled: p.stats?.sixesRolled || 0
          }));
          await this.supabase.from('match_players').insert(playerRecords);
        }

        // Save game logs
        if (match && matchData.eventLog) {
          const logRecords = matchData.eventLog.map(e => ({
            match_id: match.id,
            turn_number: e.turn || 0,
            player_name: e.data?.player || e.data?.name || 'system',
            event_type: this._mapEventType(e.type),
            event_data: e.data
          }));
          // Batch insert in chunks
          for (let i = 0; i < logRecords.length; i += 100) {
            await this.supabase.from('game_logs').insert(logRecords.slice(i, i + 100));
          }
        }

        return match;
      } catch (e) {
        console.warn('DB saveMatch error:', e);
      }
    }

    // Local fallback
    const matches = this._getLocalData('matches');
    matchRecord.id = crypto.randomUUID();
    matchRecord.players = matchData.players;
    matches.push(matchRecord);
    this._setLocalData('matches', matches);
    return matchRecord;
  }

  // ============================================================
  // Leaderboard
  // ============================================================

  /** Get leaderboard data */
  async getLeaderboard(limit = 20) {
    if (this.isOnline) {
      try {
        const { data, error } = await this.supabase
          .from('players')
          .select('name, wins, losses, games_played, total_snakes_hit, total_ladders_climbed, total_sixes_rolled, created_at')
          .order('wins', { ascending: false })
          .order('games_played', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return (data || []).map(p => ({
          ...p,
          win_rate: p.games_played > 0 ? ((p.wins / p.games_played) * 100).toFixed(1) : '0.0'
        }));
      } catch (e) {
        console.warn('DB getLeaderboard error:', e);
      }
    }

    // Local fallback
    const players = this._getLocalData('players');
    return players
      .map(p => ({
        ...p,
        win_rate: p.games_played > 0 ? ((p.wins / p.games_played) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.wins - a.wins || b.games_played - a.games_played)
      .slice(0, limit);
  }

  /** Get match history */
  async getMatchHistory(limit = 20) {
    if (this.isOnline) {
      try {
        const { data, error } = await this.supabase
          .from('matches')
          .select('*, match_players(*)')
          .order('ended_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return data || [];
      } catch (e) {
        console.warn('DB getMatchHistory error:', e);
      }
    }

    // Local fallback
    const matches = this._getLocalData('matches');
    return matches.slice(-limit).reverse();
  }

  // ============================================================
  // Helpers
  // ============================================================

  _mapEventType(type) {
    const validTypes = ['dice_roll', 'move', 'snake', 'ladder', 'win', 'bounce_back', 'extra_turn', 'game_start', 'game_over'];
    return validTypes.includes(type) ? type : 'move';
  }

  _getLocalData(key) {
    try {
      return JSON.parse(localStorage.getItem(`snl_${key}`) || '[]');
    } catch {
      return [];
    }
  }

  _setLocalData(key, data) {
    try {
      localStorage.setItem(`snl_${key}`, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  }
}
