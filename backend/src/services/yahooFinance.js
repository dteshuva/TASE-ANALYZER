import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

// Short-lived cache so /api/quote and /api/analyze share a single Yahoo round-trip
// when fired in parallel from the frontend.
const YAHOO_TTL = 60 * 1000;
const stockCache = new Map();
const historyCache = new Map();

function cachedFetch(cache, key, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < YAHOO_TTL) {
    return entry.promise;
  }
  const promise = fn();
  cache.set(key, { promise, timestamp: Date.now() });
  promise.catch(() => cache.delete(key));
  return promise;
}

export async function fetchYahooStockData(ticker) {
  const formattedTicker = toTATicker(ticker);
  return cachedFetch(stockCache, formattedTicker, () => doFetchStock(formattedTicker));
}

export async function fetchYahooHistory(ticker) {
  const formattedTicker = toTATicker(ticker);
  return cachedFetch(historyCache, formattedTicker, () => doFetchHistory(formattedTicker));
}

async function doFetchStock(formattedTicker) {
  let result;
  try {
    result = await yf.quoteSummary(formattedTicker, { modules: ['price', 'summaryDetail'] });
  } catch (err) {
    const notFound = /not found|no fundamentals/i.test(err.message);
    const e = new Error(notFound ? `Symbol ${formattedTicker} not found on TASE` : err.message);
    e.status = notFound ? 404 : 502;
    throw e;
  }

  const price = result.price || {};
  const summary = result.summaryDetail || {};

  // Prices from Yahoo Finance for TASE are in ILA (agorot).
  return {
    ticker: formattedTicker,
    shortName: price.shortName ?? null,
    longName: price.longName ?? null,
    currentPrice: price.regularMarketPrice ?? null,
    priceChange: price.regularMarketChangePercent != null
      ? +(price.regularMarketChangePercent * 100).toFixed(4)
      : null,
    marketCap: summary.marketCap ?? null,
    high52: summary.fiftyTwoWeekHigh ?? null,
    low52: summary.fiftyTwoWeekLow ?? null,
    pe: summary.trailingPE != null ? +summary.trailingPE.toFixed(2) : null,
    currency: 'ILA',
    timestamp: new Date().toISOString(),
    source: 'yahoo-finance',
  };
}

async function doFetchHistory(formattedTicker) {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);

  let result;
  try {
    result = await yf.chart(formattedTicker, {
      period1: period1.toISOString().slice(0, 10),
      period2: period2.toISOString().slice(0, 10),
      interval: '1mo',
    });
  } catch (err) {
    const notFound = /not found|no fundamentals/i.test(err.message);
    const e = new Error(notFound ? `Symbol ${formattedTicker} not found on TASE` : err.message);
    e.status = notFound ? 404 : 502;
    throw e;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (result.quotes || [])
    .filter((q) => q.close != null)
    .map((q) => ({
      month: MONTHS[new Date(q.date).getMonth()],
      price: Math.round(q.close),
    }));
}

export async function searchTASEStocks(query) {
  const result = await yf.search(query);
  return (result.quotes || [])
    .filter((q) => q.symbol?.endsWith('.TA') && q.quoteType === 'EQUITY')
    .slice(0, 4)
    .map((q) => ({
      ticker: q.symbol.replace('.TA', ''),
      name: q.shortname || q.longname || q.symbol,
    }));
}

function toTATicker(ticker) {
  const t = ticker.toUpperCase();
  return t.endsWith('.TA') ? t : `${t}.TA`;
}
