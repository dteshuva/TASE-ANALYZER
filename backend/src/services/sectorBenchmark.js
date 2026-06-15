import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECTOR_BASKETS, SECTOR_LABELS, resolveSectorKey } from '../data/sectorBaskets.js';
import { fetchYahooStockData, trailing12mReturn } from './yahooFinance.js';

// Cached peer-basket benchmark: each sector's 12-month return is the official-
// weighted average of its TA-125 constituents' 12-month returns, using TASE's
// own "Weight Within Sector (%)" (sectorBaskets/ta125_weights.json). Membership/
// sectors/weights come from the official TA-125; returns are recomputed each
// refresh from live Yahoo data. Results are cached 24h and persisted to disk so we
// NEVER fetch a whole basket on a page load (stale-while-revalidate).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', 'sector_benchmarks.json');
const TTL = 24 * 60 * 60 * 1000;

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
const inflight = {};

function persist() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch { /* best-effort */ }
}

// Yahoo's TASE history contains glitched series (unadjusted splits/partnership
// units) that produce bogus triple-digit-plus 12m returns. Drop those outliers
// and renormalize the remaining constituents' official weights before averaging.
const GLITCH_THRESHOLD = 200;

// Compute (or refresh) one sector's benchmark. Heavy (one Yahoo round-trip per
// constituent) — only ever called in the background, never on the request path.
export async function computeSectorReturn(key) {
  const basket = SECTOR_BASKETS[key];
  if (!basket || !basket.length) return null;

  const results = await Promise.all(
    basket.map(async (c) => {
      try {
        const d = await fetchYahooStockData(c.ticker);
        if (d.currentPrice == null) return null;
        const ret = await trailing12mReturn(d.ticker, d.currentPrice);
        if (ret == null) return null;
        return { ticker: c.ticker, weight: c.weight, return: ret };
      } catch {
        return null;
      }
    })
  );

  const ok = results.filter(Boolean);
  if (!ok.length) return null;

  // Drop glitched constituents and renormalize the official weights among the
  // remaining ones (fall back to the unfiltered set if everything looks glitched).
  const clean = ok.filter((r) => Math.abs(r.return) < GLITCH_THRESHOLD);
  const used = clean.length ? clean : ok;

  const totalWeight = used.reduce((s, r) => s + r.weight, 0) || used.length;
  const return12m = +(
    used.reduce((s, r) => s + r.return * (r.weight / totalWeight), 0)
  ).toFixed(1);

  // Record shape is intentionally series-ready: adding a normalized price series
  // later is purely additive (fill `series`), no rewrite.
  cache[key] = {
    sector: key,
    label: SECTOR_LABELS[key] || key,
    computedAt: Date.now(),
    window: { months: 12 },
    weighting: 'official-weighted',
    basketSize: basket.length,
    constituentCount: used.length,
    constituents: used.map((r) => ({ ticker: r.ticker, weight: r.weight, return: r.return })),
    return12m,
    series: null,
  };
  persist();
  return cache[key];
}

const isFresh = (rec) => rec && Date.now() - rec.computedAt < TTL;

// Read path used by the API: returns the cached record immediately (or null on a
// cold sector), and kicks off a background refresh if missing/stale.
export function getSectorReturn(key) {
  if (!key) return null;
  const rec = cache[key];
  if (!isFresh(rec) && !inflight[key]) {
    inflight[key] = computeSectorReturn(key)
      .catch(() => null)
      .finally(() => { delete inflight[key]; });
  }
  return rec || null;
}

// One-shot pre-warm of every sector (npm run warm-sectors).
export async function warmAll() {
  for (const key of Object.keys(SECTOR_BASKETS)) {
    process.stderr.write(`computing ${key} ... `);
    const r = await computeSectorReturn(key);
    process.stderr.write(r ? `${r.return12m}% (${r.constituentCount}/${r.basketSize})\n` : 'failed\n');
  }
}

export { SECTOR_LABELS, resolveSectorKey };
