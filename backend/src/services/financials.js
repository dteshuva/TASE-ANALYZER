import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import { toTATicker, withRetry, timeoutFetch } from './yahooFinance.js';

// Curated line items per statement: the older yahoo-finance2 quoteSummary
// submodules (incomeStatementHistory etc.) have returned almost no data since
// Nov 2024, so we use fundamentalsTimeSeries instead. Its raw payload has 50+
// fields per period. Banks don't report COGS/gross profit/operating income or
// a current/non-current split on the balance sheet (their statements are
// structured differently), so those cells legitimately show "—" for banks —
// same as any finance site. Verified populated for an industrial (TEVA), a
// chemicals company (ICL) and a bank (POLI, for the fields banks DO report).
export const LINE_ITEMS = {
  income: [
    'totalRevenue',
    'costOfRevenue',
    'grossProfit',
    'researchAndDevelopment',
    'sellingGeneralAndAdministration',
    'operatingIncome',
    'EBITDA',
    'interestExpense',
    'pretaxIncome',
    'taxProvision',
    'netIncome',
    'netIncomeCommonStockholders',
    'basicEPS',
    'dilutedEPS',
    'dilutedAverageShares',
  ],
  balanceSheet: [
    'totalAssets',
    'currentAssets',
    'cashAndCashEquivalents',
    'accountsReceivable',
    'inventory',
    'netPPE',
    'goodwill',
    'totalLiabilitiesNetMinorityInterest',
    'currentLiabilities',
    'accountsPayable',
    'longTermDebt',
    'totalDebt',
    'stockholdersEquity',
    'commonStockEquity',
    'retainedEarnings',
    'ordinarySharesNumber',
  ],
  cashFlow: [
    'operatingCashFlow',
    'investingCashFlow',
    'financingCashFlow',
    'capitalExpenditure',
    'freeCashFlow',
    'changesInCash',
    'endCashPosition',
  ],
};

const MODULE_BY_STATEMENT = {
  income: 'financials',
  balanceSheet: 'balance-sheet',
  cashFlow: 'cash-flow',
};

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  validation: { allowAdditionalProps: true, logErrors: false },
  // Same per-request timeout the live-quote instance uses: yahoo-finance2 has no
  // built-in fetch timeout, so a single stalled fundamentals call would hang the
  // whole 6-statement fetch until the client gives up. Fail fast instead.
  fetch: timeoutFetch,
});

// Financial statements only change when a company files a new quarterly/annual
// report (at most ~4x/year), so a much longer cache than live-price data is
// fine — 7 days, persisted to disk, stale-while-revalidate (same pattern as
// sectorBenchmark.js).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', 'financials_cache.json');
const TTL = 7 * 24 * 60 * 60 * 1000;

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
const inflight = {};

function persist() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch { /* best-effort */ }
}

function pickLineItems(period, keys) {
  const row = { date: period.date instanceof Date ? period.date.toISOString() : period.date };
  for (const key of keys) {
    row[key] = period[key] ?? null;
  }
  return row;
}

// Each statement is fetched with the same retry policy the live-quote path uses.
// Yahoo throttles bursts (a single stock view fires this 6-wide AND warms a
// sector peer-basket of up to ~28 tickers in parallel), surfacing as transient
// "fetch failed" / timeout errors that clear on a quick retry — without this,
// one unlucky call would 502 the whole financials page.
async function fetchStatement(ticker, statement, type) {
  return withRetry(async () => {
    const period1 = '2018-01-01';
    const periods = await yf.fundamentalsTimeSeries(ticker, {
      period1,
      type,
      module: MODULE_BY_STATEMENT[statement],
    });
    return periods
      .map((p) => pickLineItems(p, LINE_ITEMS[statement]))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  });
}

async function computeFinancials(ticker) {
  // allSettled, not all: a single statement that still fails after retries (e.g.
  // Yahoo doesn't report cash flow for some issuers) must not blank the entire
  // page. We serve every statement that came back and leave the rest as [].
  const statements = [
    ['income', 'annual'], ['balanceSheet', 'annual'], ['cashFlow', 'annual'],
    ['income', 'quarterly'], ['balanceSheet', 'quarterly'], ['cashFlow', 'quarterly'],
  ];
  const settled = await Promise.allSettled(
    statements.map(([s, t]) => fetchStatement(ticker, s, t))
  );

  const unwrap = (idx, label) => {
    const r = settled[idx];
    if (r.status === 'fulfilled') return r.value;
    console.error(`[financials] ${ticker} ${label} failed:`, r.reason?.message);
    return [];
  };
  const [incomeAnnual, balanceSheetAnnual, cashFlowAnnual, incomeQuarterly, balanceSheetQuarterly, cashFlowQuarterly] =
    statements.map(([s, t], i) => unwrap(i, `${s}/${t}`));

  // If every statement failed, this is a real error (bad ticker / Yahoo down) —
  // throw so the caller serves the existing cache or a 502, rather than caching
  // an all-empty record for 7 days.
  if (settled.every((r) => r.status === 'rejected')) {
    throw settled[0].reason;
  }

  const record = {
    ticker,
    computedAt: Date.now(),
    annual: { income: incomeAnnual, balanceSheet: balanceSheetAnnual, cashFlow: cashFlowAnnual },
    quarterly: { income: incomeQuarterly, balanceSheet: balanceSheetQuarterly, cashFlow: cashFlowQuarterly },
  };
  cache[ticker] = record;
  persist();
  return record;
}

const isFresh = (rec) => rec && Date.now() - rec.computedAt < TTL;

// Read path: serves the cached record immediately if present (even if stale,
// while refreshing in the background); only blocks the request when nothing
// cached exists yet.
export async function getFinancials(rawTicker) {
  const ticker = toTATicker(rawTicker);
  const rec = cache[ticker];
  if (isFresh(rec)) return rec;

  if (!inflight[ticker]) {
    inflight[ticker] = computeFinancials(ticker).finally(() => {
      delete inflight[ticker];
    });
  }

  if (rec) return rec; // stale-while-revalidate
  return inflight[ticker];
}
