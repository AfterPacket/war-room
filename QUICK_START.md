# WAR ROOM — Quick Start Guide

## Setup

### 1. Install & Run

```bash
cd war-room
npm install
npm run dev
```

Open http://localhost:3000

### 2. Configure API Keys

Navigate to **Settings** (⚙ gear icon, top-right) → **API Keys** tab.

The app works without any keys but is more useful with them. Add keys in any order:

#### Minimum Setup (Free)
- **Mapbox Token** — Interactive map (free at mapbox.com, 50,000 map loads/month)
- NASA GIBS layers work automatically with NO key

#### News Intelligence
- **NewsAPI.org** — 100 req/day free, developer plan for more
- **GNews.io** — 100 req/day free tier

#### AI Analysis (any one is enough)
- **Anthropic Claude** — Best for intelligence analysis. Get at console.anthropic.com
- **OpenAI GPT** — Alternative AI. Get at platform.openai.com
- **Google Gemini** — Free tier available at aistudio.google.com

#### Satellite Intel (Free with Registration)
- **Copernicus Sentinel Hub** — Register free at dataspace.copernicus.eu
  - Create OAuth client credentials in your account dashboard
  - Enter both Client ID and Client Secret
- **NASA FIRMS** — Free fire data. Register at firms.modaps.eosdis.nasa.gov/api
- **ACLED** — Conflict events data. Free for researchers at acleddata.com

### 3. Dashboard Usage

| Feature | How to use |
|---------|-----------|
| **Video Grid** | Click any empty tile to add a stream. Paste YouTube/Twitch URL or m3u8 link |
| **Map** | Toggle layers with the Layers button. Use Conflict Presets for quick navigation |
| **News Feed** | Auto-refreshes. Click headlines to expand. Use filters to narrow by severity |
| **AI Briefing** | Select AI provider → Brief tab: auto-generate situation report. Chat tab: ask questions |
| **Multi-screen** | Click ⧉ (pop-out) on any panel to open in a new window for multi-monitor setup |
| **Clock Strip** | Click 🌐 in header to show/hide world clocks. Configure in Settings → World Clocks |

### 4. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Open Settings |
| `G` | Toggle clock strip |
| `R` | Refresh news |
| `Esc` | Close any open sidebar/modal |

### 5. Multi-Monitor Setup

1. Open the app in your main browser window
2. Click the ⧉ icon on any panel to pop it out
3. Drag the popped window to your second monitor
4. Panels automatically sync state via BroadcastChannel

## Security Notes

- All API keys are encrypted with AES-256-GCM before storage
- Keys are stored in `.warroom-data/warroom.db` (local SQLite)
- No API keys are ever sent to the browser — all calls are server-proxied
- The `ENCRYPTION_SECRET` in `.env.local` protects the key database

## Architecture

```
app/                   # Next.js pages & API routes
├── page.tsx           # Main dashboard
├── settings/          # Settings page
├── popout/            # Multi-screen panel windows
└── api/               # Server-side API proxy routes

components/
├── layout/            # Header, Panel wrapper, Dashboard grid
├── video/             # YouTube, HLS, channel browser
├── map/               # Mapbox, layer controls, satellite
├── news/              # Feed, ticker, filters
└── ai/                # Chat, situation brief

lib/
├── security/          # Encryption, SSRF, sanitization, rate limiting
├── store/             # Zustand state stores
├── ai/                # AI provider prompts
├── multiscreen/       # BroadcastChannel sync, popout helpers
└── db.ts              # SQLite key storage
```
