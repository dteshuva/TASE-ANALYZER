import express from 'express';
import { getFinancials } from '../services/financials.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { ticker } = req.body || {};

    if (!ticker || typeof ticker !== 'string' || ticker.length > 20) {
      return res.status(400).json({ error: 'Invalid ticker' });
    }

    let record;
    try {
      record = await getFinancials(ticker);
    } catch (err) {
      const notFound = /not found|no fundamentals/i.test(err.message || '');
      return res.status(notFound ? 404 : 502).json({
        error: notFound ? `Symbol ${ticker} not found on TASE` : 'Financial data unavailable',
      });
    }

    res.json({
      ticker: record.ticker,
      annual: record.annual,
      quarterly: record.quarterly,
      updatedAt: new Date(record.computedAt).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
