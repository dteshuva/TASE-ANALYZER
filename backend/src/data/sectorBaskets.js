import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Official TA-125 membership + sector classification (sourced from TASE Maya).
// This file is the CURATED SOURCE OF TRUTH for a stock's sector; Yahoo
// assetProfile is only a fallback (see resolveSectorKey) for tickers not in TA-125.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csv = fs.readFileSync(path.join(__dirname, 'ta125_sectors.csv'), 'utf8');

// Official TA-125 "Weight Within Sector (%)" per ticker, derived from TASE's
// free-float-adjusted weights (sourced from Maya). Used to compute sector
// benchmark returns as a weighted average instead of a simple median/mean.
const WEIGHTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ta125_weights.json'), 'utf8'));

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const rows = csv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map(parseCsvLine)
  .map(([Symbol, Name, Sector, Subsector]) => ({
    ticker: (Symbol || '').trim().toUpperCase(),
    name: (Name || '').trim(),
    sector: (Sector || '').trim(),
    subsector: (Subsector || '').trim(),
  }))
  .filter((r) => r.ticker);

// Banks and Insurance behave very differently from each other and from the rest
// of "Financials", so we split them out; everything else uses its GICS sector.
export function sectorKeyFor(sector, subsector) {
  if (subsector === 'Banks') return 'Banks';
  if (subsector === 'Insurance') return 'Insurance';
  return sector;
}

// Canonical English labels per basket key (Hebrew handled in frontend i18n).
export const SECTOR_LABELS = {
  Banks: 'Banks',
  Insurance: 'Insurance',
  Financials: 'Financial Services',
  Technology: 'Technology',
  'Real Estate': 'Real Estate',
  Energy: 'Energy',
  Utilities: 'Utilities',
  Industrials: 'Industrials',
  Materials: 'Materials',
  'Consumer Staples': 'Consumer Staples',
  'Consumer Discretionary': 'Consumer Discretionary',
  'Communication Services': 'Communication Services',
  'Health Care': 'Health Care',
};

// sectorKey -> [{ ticker, name }]
export const SECTOR_BASKETS = {};
// TICKER -> sectorKey (curated authority)
export const TICKER_TO_SECTOR = {};
for (const r of rows) {
  const key = sectorKeyFor(r.sector, r.subsector);
  const weight = WEIGHTS[key]?.[r.ticker] ?? 0;
  (SECTOR_BASKETS[key] ||= []).push({ ticker: r.ticker, name: r.name, weight });
  TICKER_TO_SECTOR[r.ticker] = key;
}

// Yahoo assetProfile (GICS) sector -> our basket key, used only as a fallback
// for stocks that aren't TA-125 constituents.
const YAHOO_SECTOR_MAP = {
  'Financial Services': 'Financials',
  Technology: 'Technology',
  'Real Estate': 'Real Estate',
  Energy: 'Energy',
  Utilities: 'Utilities',
  Industrials: 'Industrials',
  'Basic Materials': 'Materials',
  'Consumer Defensive': 'Consumer Staples',
  'Consumer Cyclical': 'Consumer Discretionary',
  'Communication Services': 'Communication Services',
  Healthcare: 'Health Care',
};

// Resolve a stock's basket key: curated TA-125 map first, then Yahoo sector/industry.
export function resolveSectorKey(ticker, yahooSector, yahooIndustry) {
  const t = (ticker || '').replace('.TA', '').toUpperCase();
  if (TICKER_TO_SECTOR[t]) return TICKER_TO_SECTOR[t];
  if (yahooIndustry && /bank/i.test(yahooIndustry)) return 'Banks';
  if (yahooIndustry && /insurance/i.test(yahooIndustry)) return 'Insurance';
  return YAHOO_SECTOR_MAP[yahooSector] || null;
}
