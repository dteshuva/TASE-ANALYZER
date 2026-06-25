

import YahooFinance from 'yahoo-finance2';

// Per-request network timeout. yahoo-finance2 has NO built-in fetch timeout, so a
// single stalled Yahoo connection would otherwise hold its queue slot forever and
// starve every other lookup — the "fetch failed → whole site dead for a minute"
// cascade. Giving each fetch its own AbortSignal makes a hung call fail fast and
// free the slot, so one bad request can't take the app down with it.
const YAHOO_FETCH_TIMEOUT_MS = 15 * 1000;

// Yahoo answers HTTP 429 ("Too Many Requests") when we've burst past its per-IP
// rate limit. The raw Response — and its Retry-After header — only exists here in
// the fetch wrapper; yahoo-finance2 discards it before our retry logic ever runs.
// So we surface the 429 as a tagged error carrying exactly how long Yahoo told us
// to wait, and withRetry honours that instead of hammering the throttle.
class RateLimitError extends Error {
  constructor(retryAfterMs) {
    super('Yahoo rate limit (HTTP 429 Too Many Requests)');
    this.code = 429;
    this.retryAfterMs = retryAfterMs;
  }
}

// Retry-After is either delta-seconds ("120") or an HTTP-date; null if absent.
function parseRetryAfter(res) {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

export const timeoutFetch = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(YAHOO_FETCH_TIMEOUT_MS) });
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  return res;
};

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  // Yahoo periodically adds/renames fields in its responses. By default
  // yahoo-finance2 validates the response against a strict schema and THROWS
  // ("Failed Yahoo Schema validation") on any unexpected field — which breaks
  // working tickers whenever Yahoo tweaks its payload. Tolerate extra props and
  // don't spam the logs; we only read a handful of known fields anyway.
  validation: { allowAdditionalProps: true, logErrors: false },
  // Keep the library's default concurrency (4) so a single quote's parallel
  // Yahoo calls aren't serialized — the per-request timeout above, not
  // throttling, is what prevents the old "one stuck call freezes everything"
  // cascade, so there's no need to choke our own request rate.
  queue: { concurrency: 4 },
  fetch: timeoutFetch,
});

// Yahoo rate-limits bursts (the frontend fires /api/quote and /api/analyze
// together, each doing two Yahoo calls). Those manifest as transient
// "fetch failed" / timeout / empty-result errors that resolve on a quick retry.
export // Cap on how long we'll obey a 429's Retry-After: a real cooldown can be a full
// minute, but these calls sit on the request path (a user is waiting), so beyond
// this we'd rather fail fast and let the cache / partial-tolerance handle it than
// hang the request. The basket warm runs in the background and tolerates the cap.
const RATE_LIMIT_BACKOFF_CAP_MS = 8 * 1000;

export async function withRetry(fn, { attempts = 3, baseDelay = 350 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      // A genuine "not found" won't recover from a retry — fail fast.
      if (/not found|no fundamentals|delisted/i.test(err.message)) throw err;
      lastErr = err;
      if (i < attempts - 1) {
        // On a 429, retrying fast only digs the hole deeper (each attempt counts
        // against Yahoo's limit and pushes the cooldown out). Wait what Yahoo
        // asked for via Retry-After — or a seconds-scale fallback — instead of ms.
        const delay = err.code === 429
          ? Math.min(err.retryAfterMs ?? 2000 * (i + 1), RATE_LIMIT_BACKOFF_CAP_MS)
          : baseDelay * (i + 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// Short-lived cache so /api/quote and /api/analyze share a single Yahoo round-trip
// when fired in parallel from the frontend. Live quotes need freshness (60s);
// historical chart bars barely move intraday, so they're cached far longer to
// keep the 1Y/5Y toggle from re-hitting Yahoo on every click.
const QUOTE_TTL = 60 * 1000;
const HISTORY_TTL = 15 * 60 * 1000;
const stockCache = new Map();
const historyCache = new Map();

function cachedFetch(cache, key, fn, ttl = QUOTE_TTL) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttl) {
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

// range: '1y' (daily bars, for hover-by-day) or '5y' (weekly bars, for hover-by-week).
export async function fetchYahooHistory(ticker, range = '1y') {
  const formattedTicker = toTATicker(ticker);
  return cachedFetch(
    historyCache,
    `${formattedTicker}:${range}`,
    () => doFetchHistory(formattedTicker, range),
    HISTORY_TTL
  );
}

// Trailing 12-month PRICE return (%), point-to-point: the live price vs the daily
// close ~52 weeks ago. Computed from daily data + the current price because Yahoo's
// monthly bars are too coarse at the window edges (they skip the latest weeks and
// overshoot the start) and its defaultKeyStatistics "52WeekChange" field is
// inconsistently scaled (a fraction for equities, already a percent for indices).
export async function trailing12mReturn(formattedTicker, currentPrice) {
  if (currentPrice == null) return null;
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);

  let result;
  try {
    result = await withRetry(() =>
      yf.chart(formattedTicker, {
        period1: period1.toISOString().slice(0, 10),
        period2: period2.toISOString().slice(0, 10),
        interval: '1d',
      })
    );
  } catch {
    return null; // a returns figure is supplementary — never fail the quote over it
  }

  const closes = (result.quotes || []).filter((q) => q.close != null).map((q) => q.close);
  if (closes.length < 2) return null;
  // Baseline = the ACTUAL window-start close, so a fast first week doesn't inflate
  // it (a median-of-first-5 baseline sat ~5% high on stocks that ran up early).
  // Guard against Yahoo's occasional bogus opening tick (e.g. TSEM showing a wild
  // ~14500 vs a real ~3000): if the first close is way off the median of the next
  // few, it's a glitch — fall back to that median.
  const first = closes[0];
  const next = closes.slice(1, 6).sort((a, b) => a - b);
  const med = next[Math.floor(next.length / 2)];
  const baseline = med && Math.abs(first - med) / med > 0.5 ? med : first;
  if (!baseline) return null;

  return +(((currentPrice - baseline) / baseline) * 100).toFixed(1);
}

async function doFetchStock(formattedTicker) {
  let result;
  try {
    result = await withRetry(() =>
      yf.quoteSummary(formattedTicker, {
        modules: ['price', 'summaryDetail', 'assetProfile', 'defaultKeyStatistics', 'financialData'],
      })
    );
  } catch (err) {
    const notFound = /not found|no fundamentals/i.test(err.message);
    const e = new Error(notFound ? `Symbol ${formattedTicker} not found on TASE` : err.message);
    e.status = notFound ? 404 : 502;
    throw e;
  }

  const price = result.price || {};
  const summary = result.summaryDetail || {};
  const profile = result.assetProfile || {};
  const keyStats = result.defaultKeyStatistics || {};
  const financialData = result.financialData || {};

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
    volume: price.regularMarketVolume ?? summary.volume ?? null,
    avgVolume: summary.averageVolume ?? summary.averageDailyVolume3Month ?? null,
    // Yahoo reports dividendYield as a decimal fraction (e.g. 0.0372 = 3.72%).
    dividendYield: summary.dividendYield ?? null,
    exDividendDate: summary.exDividendDate ?? null,
    // Sourced sector/industry from Yahoo (GICS) — far more reliable than the
    // AI-guessed sector, especially for Israel-only names.
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    pe: summary.trailingPE != null ? +summary.trailingPE.toFixed(2) : null,
    forwardPE: summary.forwardPE != null ? +summary.forwardPE.toFixed(2) : null,
    beta: keyStats.beta ?? null,
    eps: keyStats.trailingEps ?? null,
    totalRevenue: financialData.totalRevenue ?? null,
    netIncome: keyStats.netIncomeToCommon ?? null,
    open: price.regularMarketOpen ?? null,
    previousClose: price.regularMarketPreviousClose ?? summary.previousClose ?? null,
    dayHigh: price.regularMarketDayHigh ?? null,
    dayLow: price.regularMarketDayLow ?? null,
    currency: 'ILA',
    timestamp: new Date().toISOString(),
    source: 'yahoo-finance',
  };
}

// 1y -> daily bars (hover reveals the exact day's price); 5y -> weekly bars
// (hover reveals the week's price). Yahoo throttles how far back intraday-ish
// intervals can go, so daily is only requested for the shorter 1y window.
const RANGE_CONFIG = {
  '1y': { years: 1, interval: '1d' },
  '5y': { years: 5, interval: '1wk' },
};

async function doFetchHistory(formattedTicker, range) {
  const config = RANGE_CONFIG[range] || RANGE_CONFIG['1y'];
  const now = new Date();
  const period1 = new Date(Date.UTC(now.getUTCFullYear() - config.years, now.getUTCMonth(), now.getUTCDate()));

  let result;
  try {
    result = await withRetry(() =>
      yf.chart(formattedTicker, {
        period1: period1.toISOString().slice(0, 10),
        period2: now.toISOString().slice(0, 10),
        interval: config.interval,
      })
    );
  } catch (err) {
    const notFound = /not found|no fundamentals/i.test(err.message);
    const e = new Error(notFound ? `Symbol ${formattedTicker} not found on TASE` : err.message);
    e.status = notFound ? 404 : 502;
    throw e;
  }

  // Format dates in the exchange timezone — Yahoo's bar timestamps are
  // midnight-local, and rendering them in UTC/server-local time can shift the
  // displayed date by a day.
  const tz = result.meta?.exchangeTimezoneName || 'Asia/Jerusalem';
  const labelFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' });
  return (result.quotes || [])
    .filter((q) => q.close != null)
    .map((q) => {
      const d = new Date(q.date);
      return {
        date: d.toISOString().slice(0, 10), // ISO day — used to derive sparse axis ticks
        label: labelFmt.format(d), // full date for the tooltip, e.g. "Jun 15, 2025"
        price: Math.round(q.close),
      };
    });
}

// The TA-125 is the headline TASE benchmark index. Its trailing 52-week return
// barely moves between requests, so cache it for an hour and share it across quotes.
export const BENCHMARK_NAME = 'TA-125';
const BENCHMARK_SYMBOL = '^TA125.TA';
const BENCHMARK_TTL = 60 * 60 * 1000;
let benchmarkCache = { value: null, timestamp: 0 };

export async function fetchBenchmark12mReturn() {
  if (benchmarkCache.value != null && Date.now() - benchmarkCache.timestamp < BENCHMARK_TTL) {
    return benchmarkCache.value;
  }
  const idx = await fetchYahooStockData(BENCHMARK_SYMBOL);
  const ret = await trailing12mReturn(BENCHMARK_SYMBOL, idx.currentPrice);
  if (ret != null) benchmarkCache = { value: ret, timestamp: Date.now() };
  return ret;
}

// Recent news headlines for a company, via Yahoo's search endpoint. Best-effort:
// news is supplementary, so any failure degrades to an empty list.
//
// Yahoo's search ranks news by loose keyword match against the query string, so a
// company-name query (e.g. "Delek Group", "Harel Insurance") routinely pulls back
// unrelated articles that merely share a word. Each news item carries a
// `relatedTickers` array though, so we only keep ones that actually name this stock.
export async function fetchStockNews(query, ticker) {
  if (!query) return [];
  const symbol = ticker ? toTATicker(ticker) : null;
  try {
    const result = await withRetry(() => yf.search(query, {}, { validateResult: false }));
    return (result.news || [])
      .filter((n) => n.title && n.link && (!symbol || n.relatedTickers?.includes(symbol)))
      .slice(0, 4)
      .map((n) => ({
        title: n.title,
        publisher: n.publisher || null,
        link: n.link,
        time: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null,
      }));
  } catch {
    return [];
  }
}

export async function searchTASEStocks(query) {
  // validateResult:false — Yahoo's /search payload (news, navigation, etc.) does
  // NOT pass yahoo-finance2's strict schema even with allowAdditionalProps, so the
  // default would throw "Failed Yahoo Schema validation" and we'd lose all matches.
  // Request a wider candidate pool — Yahoo ranks foreign listings above the .TA
  // ones for generic terms, so the default (~6) often contains no TASE matches.
  const result = await withRetry(() =>
    yf.search(query, { quotesCount: 20, newsCount: 0 }, { validateResult: false })
  );
  return (result.quotes || [])
    .filter((q) => q.symbol?.endsWith('.TA') && q.quoteType === 'EQUITY')
    .slice(0, 6)
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

// Fetch the price/quote only. The price chart is deliberately NOT bundled here:
// it's a heavy ~250-bar daily series that used to sit on the critical path of
// every /api/quote and /api/analyze call, gating the whole lookup on a slow
// Yahoo chart fetch. The frontend now lazy-loads it via /api/history once the
// card is on screen, so the quote itself returns as fast as a bare price fetch.
async function fetchBundle(symbol) {
  return { stockData: await fetchYahooStockData(symbol) };
}

export function toTATicker(ticker) {
  const t = ticker.trim().toUpperCase();
  return t.endsWith('.TA') ? t : `${t}.TA`;
}
