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

You need **Node.js 18+** and an **Anthropic API key** (get one at https://console.anthropic.com).

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

- **Backend**: deploy to Railway, Render, Fly.io, or any Node host. Set `ANTHROPIC_API_KEY` and `ALLOWED_ORIGINS` env vars.
- **Frontend**: `npm run build` produces `dist/`. Deploy to Vercel, Netlify, or Cloudflare Pages. Set `VITE_API_URL` to your backend's public URL.

## What's included

- Search any TASE-listed stock by name or ticker
- Claude-generated analysis: outlook, risks, catalysts
- Bullish probability score (0–100%)
- BUY / HOLD / SELL verdict
- 12-month bear and bull price targets
- Simulated 12-month price history chart
- Watchlist (saved to browser localStorage)
- Full bilingual UI with RTL layout for Hebrew

## What to add for production

1. **Real market data** — Connect to TASE's official data API or a provider (Refinitiv, Alpha Vantage's TLV symbols, Yahoo Finance unofficial). Replace the simulated chart in `frontend/src/services/api.js`.
2. **User accounts** — Add auth (Auth0, Clerk, or a custom JWT system). Persist watchlists to a database (Postgres + Prisma is a clean choice).
3. **Caching layer** — Add Redis to cache analysis results per ticker for ~5 minutes. The backend has in-memory caching as a starting point.
4. **Disclaimers** — This is not financial advice. Add prominent disclaimers per Israeli securities regulations before going live.
