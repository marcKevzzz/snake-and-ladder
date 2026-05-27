-- ============================================================
-- Snake & Ladder — Supabase Database Schema
-- Run this in Supabase SQL Editor to set up all tables
-- ============================================================

-- Players table: persistent player profiles
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    total_snakes_hit INTEGER DEFAULT 0,
    total_ladders_climbed INTEGER DEFAULT 0,
    total_sixes_rolled INTEGER DEFAULT 0,
    highest_score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on lowercase name to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_name_lower ON players (LOWER(name));

-- Matches table: record of each game
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL,
    winner_name TEXT,
    num_players INTEGER NOT NULL CHECK (num_players BETWEEN 2 AND 4),
    num_bots INTEGER DEFAULT 0,
    total_turns INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- Match participants
CREATE TABLE IF NOT EXISTS match_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    is_bot BOOLEAN DEFAULT FALSE,
    final_position INTEGER DEFAULT 0,
    finish_rank INTEGER,
    snakes_hit INTEGER DEFAULT 0,
    ladders_climbed INTEGER DEFAULT 0,
    sixes_rolled INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);

-- Game event logs (for replay / analytics)
CREATE TABLE IF NOT EXISTS game_logs (
    id BIGSERIAL PRIMARY KEY,
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    turn_number INTEGER,
    player_name TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'dice_roll', 'move', 'snake', 'ladder', 'win', 
        'bounce_back', 'extra_turn', 'game_start', 'game_over'
    )),
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_logs_match ON game_logs(match_id);
CREATE INDEX IF NOT EXISTS idx_game_logs_type ON game_logs(event_type);

-- ============================================================
-- Row Level Security (RLS) — Allow public read/write via anon key
-- ============================================================

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;

-- Public access policies (game uses anon key)
CREATE POLICY "Allow public read on players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public insert on players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on players" ON players FOR UPDATE USING (true);

CREATE POLICY "Allow public read on matches" ON matches FOR SELECT USING (true);
CREATE POLICY "Allow public insert on matches" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on matches" ON matches FOR UPDATE USING (true);

CREATE POLICY "Allow public read on match_players" ON match_players FOR SELECT USING (true);
CREATE POLICY "Allow public insert on match_players" ON match_players FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on game_logs" ON game_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on game_logs" ON game_logs FOR INSERT WITH CHECK (true);

-- ============================================================
-- Leaderboard View
-- ============================================================

CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    name,
    wins,
    losses,
    games_played,
    CASE WHEN games_played > 0 
        THEN ROUND((wins::DECIMAL / games_played) * 100, 1) 
        ELSE 0 
    END AS win_rate,
    total_snakes_hit,
    total_ladders_climbed,
    total_sixes_rolled,
    created_at
FROM players
ORDER BY wins DESC, win_rate DESC, games_played DESC
LIMIT 100;
