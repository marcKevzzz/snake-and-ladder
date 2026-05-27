# 🎲 Snake & Ladder — Online Multiplayer Board Game

A fully interactive, visually stunning Snake & Ladder game supporting up to **4 players** online or locally, with **bot opponents**, animated dice, snake slides, ladder climbs, confetti celebrations, and a persistent leaderboard.

![Game Preview](https://img.shields.io/badge/Status-v1.0.0-brightgreen) ![Players](https://img.shields.io/badge/Players-2--4-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- 🎮 **Local & Online Multiplayer** — Play on the same device or create rooms with codes
- 🤖 **Bot Players** — Add AI opponents with natural-feeling delays
- 🎲 **3D Animated Dice** — Realistic CSS 3D cube with spin animation
- 🐍 **Snake Animations** — Shake effect + sliding down the snake body
- 🪜 **Ladder Animations** — Bouncy climbing animation
- ♟️ **Pawn Hopping** — Step-by-step tile hopping with bounce easing
- 🎉 **Winner Confetti** — Multi-burst confetti celebration for winners
- 🔊 **Sound Effects** — Web Audio API generated dice rattle, snake hiss, ladder climb, and victory fanfare
- 🏆 **Leaderboard** — Persistent player rankings and match history
- 📱 **Responsive** — Works on desktop, tablet, and mobile
- ⑥ **Extra Turns** — Roll a 6 to go again!
- ⚠️ **Triple Six Penalty** — Three 6s in a row sends you back to start

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (for local dev server)
- A Supabase account (for online features — optional)

### Local Development

```bash
# Clone / navigate to the project
cd snake-and-ladder

# Start local dev server
npm run dev
```

Open `http://localhost:3000` in your browser.

### Setting Up Supabase (Optional — for Online Play + Persistent Leaderboard)

1. Create a project at [supabase.com](https://supabase.com)
2. Open the SQL Editor and paste the contents of `supabase/schema.sql`
3. Run the SQL to create all tables and policies
4. Copy your **Project URL** and **Anon Key** from Project Settings → API
5. Paste them into `js/config.js`:

```javascript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or link to a GitHub repo and deploy automatically
```

The `vercel.json` is already configured for static site deployment.

## 🎮 How to Play

1. **Add Players** — Enter names and add up to 4 players (humans or bots)
2. **Roll the Dice** — Click "Roll Dice" on your turn
3. **Move Your Pawn** — Watch it hop across tiles automatically
4. **Snakes** 🐍 — Land on a snake head → slide down to the tail!
5. **Ladders** 🪜 — Land on a ladder bottom → climb up to the top!
6. **Roll a 6** — Get an extra turn! But three 6s in a row → back to start
7. **Reach 100** — First player to land exactly on tile 100 wins! 🏆

## 📁 Project Structure

```
snake-and-ladder/
├── index.html              # Main SPA page
├── css/
│   └── styles.css          # Complete theme & styling
├── js/
│   ├── app.js              # Main application controller
│   ├── config.js            # Game constants & Supabase config
│   ├── game.js              # Core game engine
│   ├── board.js             # Board rendering (DOM + SVG)
│   ├── dice.js              # 3D CSS dice component
│   ├── animations.js        # All game animations
│   ├── sounds.js            # Web Audio API sound effects
│   ├── bot.js               # Bot AI controller
│   ├── database.js          # Supabase / localStorage operations
│   ├── multiplayer.js       # Supabase Realtime rooms
│   └── leaderboard.js       # Leaderboard UI
├── supabase/
│   └── schema.sql           # Database schema
├── vercel.json              # Vercel deployment config
├── package.json             # Project metadata
├── CHANGELOG.md             # Version history
├── docs/
│   └── DATABASE.md          # Database documentation
└── README.md                # This file
```

## 🏗️ Architecture

| Component | Technology |
|-----------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| Hosting | Vercel (static site) |
| Database | Supabase PostgreSQL |
| Real-time | Supabase Realtime (Broadcast + Presence) |
| Sounds | Web Audio API (procedurally generated) |
| Confetti | canvas-confetti |

## 📊 Board Layout

Classic 10×10 board with zigzag numbering (1→100, bottom-left to top).

**Snakes** 🐍: 16→6, 47→26, 49→11, 56→53, 62→19, 64→60, 87→24, 93→73, 95→75, 98→78

**Ladders** 🪜: 2→38, 4→14, 9→31, 21→42, 28→84, 36→44, 51→67, 71→91, 80→100

## 📄 License

MIT License — feel free to modify and share!
