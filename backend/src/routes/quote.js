import express from 'express';
import {
  loadTASEStock,
  fetchBenchmark12mReturn,
  trailing12mReturn,
  fetchStockNews,
  BENCHMARK_NAME,
} from '../services/yahooFinance.js';
import { getSectorReturn, resolveSectorKey, SECTOR_LABELS } from '../services/sectorBenchmark.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { query } = req.body || {};

    if (!query || typeof query !== 'string' || query.length > 100) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    // Accepts a ticker ("TEVA") or a company name ("bank leumi"). The price
    // chart is lazy-loaded separately by the frontend via /api/history, so it's
    // intentionally not part of this response.
    let stockData;
    try {
      ({ stockData } = await loadTASEStock(query));
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
    const newsPromise = fetchStockNews(companyName, stockData.ticker);

    // 12-month performance of the stock vs the TA-125 benchmark. Optional — a
    // benchmark hiccup must never fail the quote, so it degrades to null.
    let performance = null;
    let stockReturn12 = null;
    try {
      const [benchmark, stockReturn] = await Promise.all([
        fetchBenchmark12mReturn(),
        trailing12mReturn(stockData.ticker, stockData.currentPrice),
      ]);
      stockReturn12 = stockReturn;
      if (benchmark != null && stockReturn != null) {
        performance = { stock: stockReturn, benchmark, benchmarkName: BENCHMARK_NAME };
      }
    } catch {
      performance = null;
    }

    // Stock vs its SECTOR peer benchmark (cached 24h; reads never block — a cold
    // sector returns `pending` and warms in the background).
    let sectorComparison = null;
    try {
      const key = resolveSectorKey(stockData.ticker, stockData.sector, stockData.industry);
      if (key) {
        const rec = getSectorReturn(key);
        const sectorName = rec?.label || SECTOR_LABELS[key] || key;
        if (rec && rec.return12m != null && stockReturn12 != null) {
          sectorComparison = {
            sectorKey: key,
            sectorName,
            sectorReturn: rec.return12m,
            stockReturn: stockReturn12,
            delta: +(stockReturn12 - rec.return12m).toFixed(1),
            constituentCount: rec.constituentCount,
          };
        } else {
          sectorComparison = { sectorKey: key, sectorName, pending: true };
        }
      }
    } catch {
      sectorComparison = null;
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
      sectorComparison,
      news,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
