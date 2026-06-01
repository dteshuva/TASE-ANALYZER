import express from 'express';
import { loadTASEStock } from '../services/yahooFinance.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { query } = req.body || {};

    if (!query || typeof query !== 'string' || query.length > 100) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    // Accepts a ticker ("TEVA") or a company name ("bank leumi").
    let stockData, chartData;
    try {
      ({ stockData, chartData } = await loadTASEStock(query));
    } catch (yahooErr) {
      if (yahooErr.status === 404) {
        return res.status(404).json({
          error: 'Symbol not found on TASE',
          suggestions: yahooErr.suggestions || [],
        });
      }
      return res.status(502).json({ error: yahooErr.message || 'Market data unavailable' });
    }

    res.json({
      ticker: stockData.ticker,
      companyName: stockData.longName || stockData.shortName || stockData.ticker,
      currentPrice: stockData.currentPrice,
      priceChange: stockData.priceChange,
      marketCap: stockData.marketCap != null
        ? `₪${(stockData.marketCap / 1e9).toFixed(1)}B`
        : null,
      high52: stockData.high52,
      low52: stockData.low52,
      pe: stockData.pe != null ? String(stockData.pe) : 'N/A',
      currency: stockData.currency,
      chartData,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
