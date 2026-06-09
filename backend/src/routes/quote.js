import express from 'express';
import {
  loadTASEStock,
  fetchBenchmark12mReturn,
  trailing12mReturn,
  fetchStockNews,
  BENCHMARK_NAME,
} from '../services/yahooFinance.js';

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

    const companyName = stockData.longName || stockData.shortName || stockData.ticker;
    // Kick off news in parallel; it never throws (degrades to []).
    const newsPromise = fetchStockNews(companyName);

    // 12-month performance of the stock vs the TA-125 benchmark. Optional — a
    // benchmark hiccup must never fail the quote, so it degrades to null.
    let performance = null;
    try {
      const [benchmark, stockReturn] = await Promise.all([
        fetchBenchmark12mReturn(),
        trailing12mReturn(stockData.ticker, stockData.currentPrice),
      ]);
      if (benchmark != null && stockReturn != null) {
        performance = { stock: stockReturn, benchmark, benchmarkName: BENCHMARK_NAME };
      }
    } catch {
      performance = null;
    }

    const news = await newsPromise;

    res.json({
      ticker: stockData.ticker,
      companyName: stockData.longName || stockData.shortName || stockData.ticker,
      sector: stockData.sector,
      industry: stockData.industry,
      currentPrice: stockData.currentPrice,
      priceChange: stockData.priceChange,
      marketCap: stockData.marketCap != null
        ? `₪${(stockData.marketCap / 1e9).toFixed(1)}B`
        : null,
      high52: stockData.high52,
      low52: stockData.low52,
      volume: stockData.volume,
      avgVolume: stockData.avgVolume,
      dividendYield: stockData.dividendYield,
      pe: stockData.pe != null ? String(stockData.pe) : 'N/A',
      currency: stockData.currency,
      performance,
      news,
      chartData,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
