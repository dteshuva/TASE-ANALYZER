import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  // Yahoo periodically adds/renames fields in its responses. By default
  // yahoo-finance2 validates the response against a strict schema and THROWS
  // ("Failed Yahoo Schema validation") on any unexpected field — which breaks
  // working tickers whenever Yahoo tweaks its payload. Tolerate extra props and
  // don't spam the logs; we only read a handful of known fields anyway.
  validation: { allowAdditionalProps: true, logErrors: false },
});

// Yahoo rate-limits bursts (the frontend fires /api/quote and /api/analyze
// together, each doing two Yahoo calls). Those manifest as transient
// "fetch failed" / empty-result errors that resolve on a quick retry.
async function withRetry(fn, { attempts = 3, baseDelay = 350 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      // A genuine "not found" won't recover from a retry — fail fast.
      if (/not found|no fundamentals|delisted/i.test(err.message)) throw err;
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelay * (i + 1)));
      }
    }
  }
  throw lastErr;
}

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
    result = await withRetry(() =>
      yf.quoteSummary(formattedTicker, { modules: ['price', 'summaryDetail'] })
    );
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
    result = await withRetry(() =>
      yf.chart(formattedTicker, {
        period1: period1.toISOString().slice(0, 10),
        period2: period2.toISOString().slice(0, 10),
        interval: '1mo',
      })
    );
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
  // validateResult:false — Yahoo's /search payload (news, navigation, etc.) does
  // NOT pass yahoo-finance2's strict schema even with allowAdditionalProps, so the
  // default would throw "Failed Yahoo Schema validation" and we'd lose all matches.
  const result = await withRetry(() => yf.search(query, {}, { validateResult: false }));
  return (result.quotes || [])
    .filter((q) => q.symbol?.endsWith('.TA') && q.quoteType === 'EQUITY')
    .slice(0, 4)
    .map((q) => ({
      ticker: q.symbol.replace('.TA', ''),
      name: q.shortname || q.longname || q.symbol,
    }));
}

// Load a TASE stock + its history for a query that may be either a ticker
// (e.g. "TEVA", "POLI") or a company name (e.g. "bank leumi"). We try the query
// as a direct ticker first; if that 404s, we fall back to Yahoo's name search
// and use the top TASE match. On failure we throw an error carrying `.suggestions`.
export async function loadTASEStock(query) {
  const direct = await fetchBundle(toTATicker(query)).catch((err) => {
    if (err.status === 404) return { notFound: true };
    throw err;
  });
  if (!direct.notFound) return direct;

  // Not a recognized ticker — treat the query as a company name.
  const suggestions = await searchTASEStocks(query).catch(() => []);
  if (suggestions.length) {
    const resolved = await fetchBundle(`${suggestions[0].ticker}.TA`).catch(() => null);
    if (resolved) return resolved;
  }

  const e = new Error('Symbol not found on TASE');
  e.status = 404;
  e.suggestions = suggestions;
  throw e;
}

// Fetch price (essential) and history (supplementary) together. A history hiccup
// degrades to an empty chart rather than failing the whole lookup.
async function fetchBundle(symbol) {
  const [stock, history] = await Promise.allSettled([
    fetchYahooStockData(symbol),
    fetchYahooHistory(symbol),
  ]);
  if (stock.status === 'rejected') throw stock.reason;
  return {
    stockData: stock.value,
    chartData: history.status === 'fulfilled' ? history.value : [],
  };
}

function toTATicker(ticker) {
  const t = ticker.trim().toUpperCase();
  return t.endsWith('.TA') ? t : `${t}.TA`;
}
