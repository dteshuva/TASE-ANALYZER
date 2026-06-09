import express from 'express';
import { searchTASEStocks } from '../services/yahooFinance.js';
import { TASE_STOCKS } from '../data/taseStocks.js';

const router = express.Router();

// Curated matches: ticker prefix, or any word in the company name starting with
// the query (so "bank" matches "Bank Hapoalim", "phoenix" matches "The Phoenix…").
function curatedMatches(q) {
  const needle = q.toLowerCase();
  return TASE_STOCKS.filter((s) => {
    if (s.ticker.toLowerCase().startsWith(needle)) return true;
    return s.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(needle));
  });
}

// Autocomplete: given a partial company name or ticker, return matching
// TASE-listed stocks. Used by the search bar as the user types. Combines a
// curated TASE list (reliable for generic terms) with live Yahoo search.
router.post('/', async (req, res, next) => {
  try {
    const { query } = req.body || {};

    if (!query || typeof query !== 'string' || query.length > 100) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    const q = query.trim();
    // Too short to be meaningful — don't burn a Yahoo call.
    if (q.length < 2) return res.json({ results: [] });

    const yahoo = await searchTASEStocks(q).catch(() => []);
    const curated = curatedMatches(q);

    // Curated first (clean names, reliable for TASE), then Yahoo extras; dedupe by ticker.
    const seen = new Set();
    const results = [];
    for (const r of [...curated, ...yahoo]) {
      const key = r.ticker.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(r);
      if (results.length >= 7) break;
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
