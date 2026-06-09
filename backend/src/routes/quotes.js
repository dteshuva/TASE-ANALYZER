import express from 'express';
import { fetchYahooStockData } from '../services/yahooFinance.js';

const router = express.Router();

const MAX_TICKERS = 50;

// Batch price lookup for the watchlist. Takes a list of tickers and returns a
// lightweight quote (price + change) for each, so the client makes ONE request
// instead of one per saved stock. Per-ticker failures are isolated — one bad
// symbol doesn't fail the whole batch. Yahoo round-trips are deduped/cached
// (60s) inside the service layer.
router.post('/', async (req, res, next) => {
  try {
    const { tickers } = req.body || {};

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'Invalid tickers' });
    }
    if (tickers.length > MAX_TICKERS) {
      return res.status(400).json({ error: `Too many tickers (max ${MAX_TICKERS})` });
    }

    // De-dupe and drop anything that isn't a plausible ticker string.
    const clean = [
      ...new Set(
        tickers.filter((t) => typeof t === 'string' && t.trim() && t.length <= 20)
      ),
    ];

    const quotes = await Promise.all(
      clean.map(async (ticker) => {
        try {
          const d = await fetchYahooStockData(ticker);
          return {
            ticker, // echo the exact input so the client can map results back
            currentPrice: d.currentPrice,
            priceChange: d.priceChange,
            volume: d.volume,
            avgVolume: d.avgVolume,
          };
        } catch (err) {
          return { ticker, error: err.status === 404 ? 'not_found' : 'unavailable' };
        }
      })
    );

    res.json({ quotes, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
