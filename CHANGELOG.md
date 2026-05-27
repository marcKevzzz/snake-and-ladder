# 📋 Changelog

All notable changes to the Snake & Ladder project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-27

### 🎉 Initial Release

#### Added
- **Core Game Engine** — Complete Snake & Ladder rules with turn management
  - Dice rolling (1-6) with fair RNG
  - Pawn movement with exact-landing-on-100 win condition
  - Classic snake positions (10 snakes)
  - Classic ladder positions (9 ladders)
  - Extra turn on rolling a 6
  - Triple-six penalty (back to start)
  - Multi-player ranking system (1st through 4th place)

- **Interactive Animations**
  - 3D CSS dice with realistic spin-and-land animation
  - Step-by-step pawn hopping with bounce easing
  - Snake bite shake + downward slide animation
  - Ladder climbing with bouncy upward animation
  - Multi-burst confetti celebration on winning
  - Active turn pulse indicator on player cards

- **Sound Effects (Web Audio API)**
  - Dice rattle (noise burst series)
  - Pawn hop (soft pop)
  - Snake hiss (descending sawtooth + noise)
  - Ladder climb (ascending triangle arpeggio)
  - Victory fanfare (C major chord arpeggio)
  - Extra turn jingle
  - UI click sound

- **Multiplayer Support**
  - Local mode: 2-4 players on the same device
  - Online mode: Room-based via Supabase Realtime
  - Room code system (4-character alphanumeric)
  - Host-based game state management
  - Presence tracking for online players

- **Bot AI**
  - Automated dice rolling with 1-3 second random delay
  - Fun randomized bot names (RoboSnake, LadderBot, etc.)
  - Support for up to 3 bots per game

- **Database & Persistence**
  - Supabase PostgreSQL for online mode
  - localStorage fallback for offline/local mode
  - Player profiles with win/loss/game stats
  - Match recording with player rankings
  - Game event logging (dice rolls, snake/ladder events)

- **Leaderboard**
  - Player rankings sorted by wins
  - Win rate percentage
  - Snake/ladder stats per player
  - Match history with date, duration, and details
  - Medal icons for top 3 players (🥇🥈🥉)

- **UI/UX**
  - Cartoonish theme with Fredoka One + Nunito fonts
  - Warm pastel gradient background
  - SVG-drawn cartoon snakes (with eyes and tongues)
  - SVG-drawn wooden ladders with rungs
  - Responsive layout (desktop, tablet, mobile)
  - Toast notifications
  - Game rules dropdown
  - Sound mute toggle

- **Deployment**
  - Vercel-ready with `vercel.json` configuration
  - Static site (no server required)
  - CDN dependencies (Supabase JS, canvas-confetti)

- **Documentation**
  - README with setup and gameplay guide
  - Database schema documentation
  - This changelog
