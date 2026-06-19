import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import { toTATicker } from './yahooFinance.js';

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

async function fetchStatement(ticker, statement, type) {
  const period1 = '2018-01-01';
  const periods = await yf.fundamentalsTimeSeries(ticker, {
    period1,
    type,
    module: MODULE_BY_STATEMENT[statement],
  });
  return periods
    .map((p) => pickLineItems(p, LINE_ITEMS[statement]))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function computeFinancials(ticker) {
  const [incomeAnnual, balanceSheetAnnual, cashFlowAnnual, incomeQuarterly, balanceSheetQuarterly, cashFlowQuarterly] =
    await Promise.all([
      fetchStatement(ticker, 'income', 'annual'),
      fetchStatement(ticker, 'balanceSheet', 'annual'),
      fetchStatement(ticker, 'cashFlow', 'annual'),
      fetchStatement(ticker, 'income', 'quarterly'),
      fetchStatement(ticker, 'balanceSheet', 'quarterly'),
      fetchStatement(ticker, 'cashFlow', 'quarterly'),
    ]);

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
