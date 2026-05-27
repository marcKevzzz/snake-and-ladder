// ============================================================
// Leaderboard UI — Display Scores and Match History
// ============================================================

export class LeaderboardUI {
  constructor(container, database) {
    this.container = container;
    this.db = database;
    this.currentTab = 'leaderboard';
  }

  /** Render the leaderboard/history tabs */
  async render() {
    this.container.innerHTML = `
      <div class="lb-tabs">
        <button class="lb-tab active" data-tab="leaderboard">🏆 Leaderboard</button>
        <button class="lb-tab" data-tab="history">📜 Match History</button>
      </div>
      <div class="lb-content" id="lb-content">
        <div class="lb-loading">Loading...</div>
      </div>
    `;

    // Tab click handlers
    this.container.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.container.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.refresh();
      });
    });

    await this.refresh();
  }

  /** Refresh current tab data */
  async refresh() {
    const content = document.getElementById('lb-content');
    if (!content) return;

    content.innerHTML = '<div class="lb-loading"><div class="spinner"></div> Loading...</div>';

    if (this.currentTab === 'leaderboard') {
      await this._renderLeaderboard(content);
    } else {
      await this._renderHistory(content);
    }
  }

  /** Render leaderboard table */
  async _renderLeaderboard(container) {
    const data = await this.db.getLeaderboard();

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="lb-empty">
          <div class="lb-empty-icon">🏆</div>
          <p>No players yet! Play a game to appear here.</p>
        </div>
      `;
      return;
    }

    let html = `
      <table class="lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Wins</th>
            <th>Games</th>
            <th>Win Rate</th>
            <th>🐍</th>
            <th>🪜</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((player, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      html += `
        <tr class="${i < 3 ? 'top-three' : ''}">
          <td class="rank">${medal}</td>
          <td class="player-name">${this._escapeHtml(player.name)}</td>
          <td>${player.wins}</td>
          <td>${player.games_played}</td>
          <td>${player.win_rate}%</td>
          <td>${player.total_snakes_hit}</td>
          <td>${player.total_ladders_climbed}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  /** Render match history */
  async _renderHistory(container) {
    const data = await this.db.getMatchHistory();

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="lb-empty">
          <div class="lb-empty-icon">📜</div>
          <p>No matches played yet!</p>
        </div>
      `;
      return;
    }

    let html = '<div class="match-history">';

    data.forEach(match => {
      const date = new Date(match.ended_at || match.started_at);
      const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const duration = match.duration_seconds 
        ? `${Math.floor(match.duration_seconds / 60)}m ${match.duration_seconds % 60}s`
        : 'N/A';

      html += `
        <div class="match-card">
          <div class="match-header">
            <span class="match-winner">🏆 ${this._escapeHtml(match.winner_name || 'Unknown')}</span>
            <span class="match-date">${dateStr}</span>
          </div>
          <div class="match-details">
            <span>👥 ${match.num_players} players</span>
            <span>🎲 ${match.total_turns} turns</span>
            <span>⏱️ ${duration}</span>
            <span>🏠 ${match.room_code}</span>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /** Escape HTML entities */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
