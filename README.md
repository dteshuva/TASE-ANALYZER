# TASE Stock Analyzer

AI-powered stock analysis tool for the Tel Aviv Stock Exchange (TASE), with bilingual Hebrew/English support.

## Architecture

- **Backend**: Node.js + Express. Proxies requests to Anthropic's Claude API so the API key stays server-side. Includes rate limiting and basic caching.
- **Frontend**: React 18 + Vite + React Router. Bilingual UI (English/Hebrew with RTL support), Recharts for visualizations.

```
tase-analyzer/
├── backend/          Express API server
└── frontend/         React + Vite SPA
```

## Quick start

You need **Node.js 22+** and an **Anthropic API key** (get one at https://console.anthropic.com).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and paste your ANTHROPIC_API_KEY
npm run dev
```

Backend runs on `http://localhost:3001`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. Open it in your browser.

## Production deployment

- **Backend**: `render.yaml` is a Render Blueprint — in Render, New + → "Blueprint" → pick this repo. Set these env vars in the dashboard (kept out of git):
  - `ANTHROPIC_API_KEY` — your Claude API key.
  - `ALLOWED_ORIGINS` — comma-separated list of your frontend's public origin(s), e.g. your Vercel URL.
  - `APP_PASSWORD` — the shared password users must enter to access the app. **Required for access control** — if left unset, the API is open. Each user enters it once per device.
  - `NODE_ENV=production` — hides internal error details from API responses.

  On Render's free plan the service spins down after ~15min idle, causing a ~50s cold-start on the next request (the frontend's fetch will time out). A free external monitor (e.g. cron-job.org or UptimeRobot) pinging `/health` every ~10min keeps it warm.
- **Frontend**: `vercel.json` has the SPA rewrite needed for client-side routing. Deploy to Vercel (or any static host that supports SPA rewrites). Set `VITE_API_URL` to your backend's public URL.

### Access control

The app is gated by a single shared password (`APP_PASSWORD`). On first visit users are shown a login screen; on success a token is stored in the browser so they aren't asked again on that device. The password is verified server-side and every API request must carry the token, so the paid `/api/analyze` endpoint can't be called without it. Change the password at any time by updating `APP_PASSWORD` — this invalidates all existing tokens.

## What's included

- Search any TASE-listed stock by name or ticker
- Claude-generated analysis: outlook, risks, catalysts
- Bullish probability score (0–100%)
- BUY / HOLD / SELL verdict
- 12-month bear and bull price targets
- Real 12-month price history chart (Yahoo Finance)
- Stock-vs-sector performance comparison
- Related news articles per stock
- Watchlist (saved to browser localStorage)
- Full bilingual UI with RTL layout for Hebrew



