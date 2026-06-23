import express from 'express';
import { fetchYahooHistory } from '../services/yahooFinance.js';

const router = express.Router();

const VALID_RANGES = new Set(['1y', '5y']);

// On-demand price history for a single range, used to lazy-load the 5y/weekly
// series only when the user switches to it — the 1y/daily series ships
// already bundled in /api/quote so the chart paints immediately.
router.post('/', async (req, res, next) => {
  try {
    const { ticker, range } = req.body || {};

    if (!ticker || typeof ticker !== 'string' || ticker.length > 20) {
      return res.status(400).json({ error: 'Invalid ticker' });
    }
    if (!VALID_RANGES.has(range)) {
      return res.status(400).json({ error: 'Invalid range' });
    }

    const chartData = await fetchYahooHistory(ticker, range);
    res.json({ ticker, range, chartData });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'Symbol not found on TASE' });
    }
    next(err);
  }
});

export default router;
