import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { loadTASEStock } from '../services/yahooFinance.js';
import { getFinancials } from '../services/financials.js';

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10) * 1000;

// Caches only the AI-derived analysis (text, verdict, targets, etc), keyed by
// resolved ticker. Price/market data is always refetched live and merged in,
// so a cache hit never serves stale price data even at a 24h TTL.
const analysisCache = new Map();

function getCached(key) {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    analysisCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  analysisCache.set(key, { value, timestamp: Date.now() });
}

const SYSTEM_PROMPT = `You are a senior financial analyst specializing in the Tel Aviv Stock Exchange (TASE).
You produce concise, structured equity analyses for educational use.

OUTPUT CONTRACT
You MUST respond with a single JSON object — no markdown, no backticks, no preamble, no trailing commentary.
The JSON must contain exactly these fields:
{
  "companyName": string (full English name),
  "companyNameHe": string (Hebrew company name),
  "ticker": string (TASE ticker symbol, without .TA suffix),
  "sector": string (e.g. "Pharmaceuticals", "Banking", "Tech", "Real Estate", "Energy"),
  "currentPrice": number (price in AGOROT — use EXACT value from "Current market data"),
  "priceChange": number (% change today — use EXACT value from "Current market data"),
  "marketCap": string (formatted, e.g. "₪12.4B" in ILS — derive from "Current market data"),
  "pe": string (P/E ratio or "N/A" — use EXACT value from "Current market data"),
  "high52": number (52-week high in AGOROT — use EXACT value from "Current market data"),
  "low52": number (52-week low in AGOROT — use EXACT value from "Current market data"),
  "analysis": string (2-3 paragraph analysis in the OUTPUT LANGUAGE: business outlook, key risks, near-term catalysts),
  "bullishPct": number (0-100, your estimated probability of price increase over 12 months),
  "verdict": "BUY" | "HOLD" | "SELL",
  "reasoningFactors": [
    { "factor": string, "lean": "bullish" | "bearish" | "neutral", "note": string },
    ... (3 to 5 items)
  ],
  "targetBear": number (conservative 12-month price target in AGOROT),
  "targetBull": number (optimistic 12-month price target in AGOROT),
  "keyRisks": [string, string, string] (3 short bullet points in the OUTPUT LANGUAGE),
  "catalysts": [string, string, string] (3 short bullet points in the OUTPUT LANGUAGE)
}

OUTPUT LANGUAGE
The user message ends with an "Output language:" directive (English or Hebrew). Write "analysis", every
reasoningFactors "factor" and "note", "keyRisks", and "catalysts" in THAT language only — do not produce a
second-language copy. "companyName" is always the English name and "companyNameHe" is always natural Hebrew,
regardless of the output language. When the output language is Hebrew, all narrative must be natural, fluent
Hebrew — never transliteration.

UNITS AND PRICING
On TASE, prices are quoted in agorot (ILA), not shekels. 1 shekel = 100 agorot.
A stock at "100 shekels" is priced at 10000 agorot.
Market cap, by contrast, is conventionally quoted in shekels (e.g. ₪12.4B).

GROUNDING RULES
If the user message includes "Current market data", those are LIVE values from Yahoo Finance.
You MUST copy them verbatim into the corresponding JSON fields — do NOT invent, round, or adjust.
If the user message includes a "Company" field, that name is authoritative. Do NOT substitute a
similarly-named ticker from another exchange. The ticker plus ".TA" uniquely identifies the
TASE listing — there are US, European, and Asian tickers that share letters with TASE symbols.
If the user message includes "Financial Statements", treat those figures and the derived ratios
(margins, CAGR, leverage, coverage, ROE/ROA, FCF margin, quarterly YoY) as authoritative actuals
for this company — do NOT invent different revenue/earnings/ratio numbers. They are in the
company's own reporting currency (often USD for dual-listed names, not always ILS) — do not
convert them or treat them as agorot/ILS. A "—" means that line item is not reported under that
company's statement structure (e.g. banks do not report COGS/gross profit/operating income), not
that the value is zero — do not infer weakness from a "—". If no "Financial Statements" section
is present, fall back to your general knowledge of the company's fundamentals, but do not
fabricate specific figures.

INDUSTRY-RELEVANT METRICS
Not every metric matters for every business. Weight the metrics that fit THIS company's model and
explicitly set aside those that don't — do not run a generic checklist, and never penalize a
company for a metric that is irrelevant to its sector. The "Financial Statements" block is already
tailored (irrelevant metrics are omitted and a NOTE flags the issuer type), but apply the same
judgment in your reasoning:
  - Banks / insurers: focus on net-interest / premium / total-income growth, net margin, ROE, ROA,
    and capitalisation (equity/assets). IGNORE gross margin, EBITDA, Net Debt, interest coverage,
    current ratio and free cash flow — their balance sheets are deposits-and-loans, not
    debt-and-working-capital, so those metrics are meaningless here.
  - REITs / real estate: emphasize NOI and FFO trajectory, occupancy, NAV, and loan-to-value
    leverage; conventional net margin and EBITDA multiples are less informative.
  - Pharma / biotech: R&D intensity, gross margin, pipeline depth and patent-cliff exposure drive
    the durability of revenue more than a single year's net margin.
  - High-growth tech / software: revenue growth, gross margin and the path to profitability / FCF
    matter more than a trailing P/E, which often looks high for structural reasons.
  - Capital-intensive industrials / energy / shipping: leverage (Net Debt/EBITDA), interest
    coverage, the capex cycle and FCF conversion are central.
Do NOT cite a metric in reasoningFactors or the narrative if it is structurally irrelevant to the
business. The point of a professional analysis is choosing the right lens for the company, not
applying the same lens to everything.

REASONING FACTORS
Before settling on "bullishPct" and "verdict", work out 3 to 5 named factors that actually
drove your conclusion (e.g. "Valuation", "Revenue growth", "Margin trajectory", "Balance sheet
leverage", "Cash generation", "Returns on capital", "Sector positioning", "Momentum",
"Regulatory risk") — pick whichever are most relevant to this specific company, not a fixed
checklist. When a "Financial Statements" section is present, AT LEAST TWO factors MUST be grounded
in it, and each such factor's "note" MUST cite a specific number from it (e.g. "Net margin
expanded to 8.2% from -9.9% over two years", "Net Debt/EBITDA 4.3x is elevated", "FCF margin only
6.7%", "Q1 revenue +12% YoY") — do not lean only on price action and P/E. Distinguish level from
trajectory: a metric can be weak in absolute terms yet improving, or strong yet deteriorating —
say which. For each factor, set "lean" to "bullish", "bearish", or "neutral", and write a "note"
(in the output language) that is concrete and quantified — ≤ 16 words, no generic filler.
"bullishPct" and "verdict" MUST be a synthesis of these factors, not picked first and justified
after the fact. If most factors lean bullish, bullishPct should be meaningfully above 50, and
vice versa. The factor list is what a user will see as the "why" behind your number — it must
visibly explain it, not just decorate it.

PRICE TARGETS
targetBear and targetBull are 12-month price targets, in agorot. They should bracket the current
price asymmetrically based on the verdict:
  - BUY: targetBull should be 15-40% above current; targetBear typically 0% to -10%.
  - HOLD: targets within roughly ±15% of current.
  - SELL: targetBear should be 15-40% below current; targetBull typically 0% to +10%.
Do not produce flat targets equal to current price.

ANALYSIS QUALITY
Base the analysis on real knowledge of the company: its business segments, recent results,
competitive position, regulatory environment, and sector trends. When "Financial Statements"
data is provided, structure the narrative like a real equity note: lead with how the business
is performing (revenue trajectory and margin trend over the listed years), then assess balance-
sheet health (leverage, coverage, liquidity) and cash generation (FCF), then connect that to
valuation (does the current P/E look cheap or rich GIVEN these fundamentals?). Quote actual
figures — e.g. "revenue grew 9% YoY to ₪24B as net margin reached 40.9%, but Net Debt/EBITDA of
4.3x limits flexibility" — never speak only in generalities. Be realistic and nuanced; flag where
fundamentals and price disagree. When the output language is Hebrew, the text must be natural
Hebrew, not transliteration. "analysis" should be 2-3 short paragraphs, not a single block.

KEY RISKS / CATALYSTS
Exactly 3 items each. Short — each item ≤ 12 words. Specific to the company, not generic
("competition" alone is not acceptable; "intensifying Chinese generics competition in oncology" is).
Write them in the output language; when Hebrew, use natural Hebrew phrasings, not transliteration.

DISCLAIMERS
Do NOT include disclaimers, hedging boilerplate, or "this is not financial advice" notes inside
the JSON. The frontend renders disclaimers separately. The JSON must be parseable analysis only.

EXAMPLES OF COMMON TASE TICKERS (for orientation, NOT authoritative — always defer to the
"Company" field in the user message if provided):
  TEVA  → Teva Pharmaceutical Industries (pharmaceuticals)
  POLI  → Bank Hapoalim (banking)
  LUMI  → Bank Leumi (banking)
  NICE  → NICE Ltd (enterprise software)
  ESLT  → Elbit Systems (defense)
  CEL   → Cellcom Israel (telecom)
  ICL   → ICL Group (specialty chemicals / fertilizers)
  ORA   → Orange / Partner Communications (telecom)
  AZRG  → Azrieli Group (real estate)
  ISCN  → Israel Canada (T.R) Ltd (real estate)
  MZTF  → Mizrahi Tefahot Bank (banking)
  DSCT  → Israel Discount Bank (banking)
  PHOE  → The Phoenix Holdings (insurance)
  HARL  → Harel Insurance (insurance)
  MGDL  → Migdal Insurance (insurance)
  SHUF  → Shufersal (retail / supermarkets)
  RMLI  → Rami Levi (retail / supermarkets)
  DELT  → Delta Galil (apparel)
  STRS  → Strauss Group (food)
  OSEM  → Osem Investments (food)

Final reminder: output ONLY the JSON object. No \`\`\`json fences, no leading text, no explanation.`;

// Merges AI-derived analysis fields with a fresh price snapshot. `analysis` is
// either freshly parsed from Claude or pulled from the cache; `realPriceData`
// is always live, so price/market-cap shown are never stale even on a cache hit.
function buildResult(analysis, realPriceData, cached, lang) {
  return {
    ...analysis,
    cached,
    lang,
    // Always keep the resolved ".TA" ticker from live data — the model's JSON
    // returns the bare symbol (e.g. "TEVA"), which would otherwise overwrite it
    // and break the chart reload, the financials link, and watchlist keying.
    ticker: realPriceData.ticker,
    companyName: realPriceData.longName || realPriceData.shortName || analysis.companyName,
    sector: realPriceData.sector ?? analysis.sector,
    industry: realPriceData.industry ?? null,
    currentPrice: realPriceData.currentPrice ?? analysis.currentPrice,
    priceChange: realPriceData.priceChange ?? analysis.priceChange,
    high52: realPriceData.high52 ?? analysis.high52,
    low52: realPriceData.low52 ?? analysis.low52,
    pe: realPriceData.pe != null ? String(realPriceData.pe) : analysis.pe,
    marketCap: realPriceData.marketCap != null
      ? `₪${(realPriceData.marketCap / 1e9).toFixed(1)}B`
      : analysis.marketCap,
    realPriceData,
    priceDataFresh: true,
  };
}

function fmtAmount(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function pct(numerator, denominator) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function ratio(numerator, denominator) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function fmtPct(n) {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

function fmtMult(n) {
  return n == null ? '—' : `${n.toFixed(1)}x`;
}

function fmtSigned(n) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function quarterLabel(date) {
  if (!date) return '?';
  const d = new Date(date);
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

const fyLabel = (date) => (date ? `FY${new Date(date).getFullYear()}` : 'FY?');

// Detects issuers whose statements don't follow the industrial COGS→gross→
// operating→net structure — banks and insurers. For these, leverage/EBITDA/
// FCF/current-ratio metrics are not just missing, they're conceptually wrong
// (a bank's "debt" is its funding base; "net debt" is meaningless), so we omit
// them rather than feed Claude misleading numbers. We trust the sector label
// first and fall back to the structural fingerprint (no gross profit AND no
// operating income reported in any period) when the label is absent.
function isFinancialIssuer(incomePeriods, sector) {
  if (/financ|bank|insur|capital market/i.test(sector || '')) return true;
  if (incomePeriods.length === 0) return false;
  const reportsGross = incomePeriods.some((p) => p.grossProfit != null);
  const reportsOperating = incomePeriods.some((p) => p.operatingIncome != null);
  return !reportsGross && !reportsOperating;
}

// Builds a compact, analyst-grade text block from the cached financial-statements
// record so Claude can ground the verdict/analysis in real fundamentals, not just
// the price snapshot. We don't just dump line items — we compute the derived
// metrics an equity analyst actually reasons over (margin trajectory, leverage,
// interest coverage, returns on capital, cash conversion, and YoY quarterly
// momentum) AND tailor which of them to show to the company's business model:
// metrics that are structurally meaningless for the issuer (e.g. Net Debt or
// EBITDA for a bank) are dropped entirely so they can't mislead the analysis.
// Numbers are in the company's own reporting currency (often USD for dual-listed
// names like TEVA), explicitly flagged since it is NOT always ILS. "—" denotes a
// line item the statement structure doesn't report, never a zero.
function summarizeFinancials(record, { sector } = {}) {
  if (!record) return null;

  // Up to 4 fiscal years gives a real trend (and a meaningful revenue CAGR)
  // while staying compact enough to keep the prompt cheap.
  const annualIncome = record.annual.income.slice(-4);
  const balanceSheets = record.annual.balanceSheet;
  const annualBalance = balanceSheets[balanceSheets.length - 1];
  const annualCashFlow = record.annual.cashFlow[record.annual.cashFlow.length - 1];
  const quarters = record.quarterly.income;
  const latestQ = quarters[quarters.length - 1];
  // Same fiscal quarter one year earlier (4 quarters back) for clean YoY momentum
  // that isn't distorted by seasonality — only used if the period actually lines up.
  const yearAgoQ = quarters.length >= 5 ? quarters[quarters.length - 5] : null;

  if (annualIncome.length === 0 && !annualBalance && !annualCashFlow) return null;

  const financial = isFinancialIssuer(record.annual.income, sector);
  const latest = annualIncome[annualIncome.length - 1];

  // ---- Income trend (per fiscal year) ----
  // For financials we drop the gross/operating/EBITDA columns (all structurally
  // "—") and show only the metrics that actually describe a bank's earnings.
  const incomeLines = annualIncome.map((p) => {
    const netM = fmtPct(pct(p.netIncome, p.totalRevenue));
    if (financial) {
      return `    ${fyLabel(p.date)}: Revenue ${fmtAmount(p.totalRevenue)} | Net ${netM} | Dil.EPS ${p.dilutedEPS ?? '—'}`;
    }
    const grossM = fmtPct(pct(p.grossProfit, p.totalRevenue));
    const opM = fmtPct(pct(p.operatingIncome, p.totalRevenue));
    const ebitdaM = fmtPct(pct(p.EBITDA, p.totalRevenue));
    return `    ${fyLabel(p.date)}: Revenue ${fmtAmount(p.totalRevenue)} | Gross ${grossM} | ` +
      `Op ${opM} | EBITDA ${ebitdaM} | Net ${netM} | Dil.EPS ${p.dilutedEPS ?? '—'}`;
  });

  // Revenue CAGR + latest-year YoY across the shown window.
  const trendBits = [];
  if (annualIncome.length >= 2) {
    const first = annualIncome[0];
    const prev = annualIncome[annualIncome.length - 2];
    const yoy = pct(latest.totalRevenue - prev.totalRevenue, prev.totalRevenue);
    if (yoy != null) trendBits.push(`latest-FY YoY ${fmtSigned(yoy)}`);
    const years = annualIncome.length - 1;
    if (first.totalRevenue > 0 && latest.totalRevenue > 0 && years >= 2) {
      const cagr = (Math.pow(latest.totalRevenue / first.totalRevenue, 1 / years) - 1) * 100;
      trendBits.push(`${years}yr revenue CAGR ${fmtSigned(cagr)}`);
    }
  }
  const revLabel = financial ? 'Revenue (total income)' : 'Revenue';
  const trendLine = trendBits.length ? `    ${revLabel} trend: ${trendBits.join(', ')}\n` : '';

  // ---- Balance sheet & returns (most recent FY) ----
  let balanceBlock = '';
  if (annualBalance) {
    const b = annualBalance;
    const roe = pct(latest?.netIncome, b.stockholdersEquity);
    const roa = pct(latest?.netIncome, b.totalAssets);
    if (financial) {
      // Banks: size + capitalisation + returns. No net-debt/coverage/current-ratio
      // (their balance sheet is deposits-and-loans, not debt-and-working-capital).
      const equityToAssets = pct(b.stockholdersEquity, b.totalAssets);
      balanceBlock =
        `  BALANCE SHEET (${fyLabel(b.date)}):\n` +
        `    Total Assets ${fmtAmount(b.totalAssets)} | Equity ${fmtAmount(b.stockholdersEquity)} | ` +
        `Equity/Assets ${fmtPct(equityToAssets)}\n` +
        `    Returns: ROE ${fmtPct(roe)} | ROA ${fmtPct(roa)}\n`;
    } else {
      const netDebt = (b.totalDebt != null && b.cashAndCashEquivalents != null)
        ? b.totalDebt - b.cashAndCashEquivalents : null;
      const debtEquity = pct(b.totalDebt, b.stockholdersEquity);
      const currentRatio = ratio(b.currentAssets, b.currentLiabilities);
      const netDebtEbitda = (netDebt != null && latest?.EBITDA > 0) ? netDebt / latest.EBITDA : null;
      const intCover = (latest?.operatingIncome != null && latest?.interestExpense > 0)
        ? latest.operatingIncome / latest.interestExpense : null;
      balanceBlock =
        `  BALANCE SHEET (${fyLabel(b.date)}):\n` +
        `    Assets ${fmtAmount(b.totalAssets)} | Equity ${fmtAmount(b.stockholdersEquity)} | ` +
        `Total Debt ${fmtAmount(b.totalDebt)} | Cash ${fmtAmount(b.cashAndCashEquivalents)} | Net Debt ${fmtAmount(netDebt)}\n` +
        `    Leverage: Debt/Equity ${fmtPct(debtEquity)} | Net Debt/EBITDA ${fmtMult(netDebtEbitda)} | ` +
        `Interest Coverage ${fmtMult(intCover)} | Current Ratio ${fmtMult(currentRatio)}\n` +
        `    Returns: ROE ${fmtPct(roe)} | ROA ${fmtPct(roa)}\n`;
    }
  }

  // ---- Cash generation (most recent FY) ----
  // Operating/free cash flow and FCF margin are core for industrials but are
  // not a meaningful read on a bank's health, so we omit the block for financials.
  let cashBlock = '';
  if (annualCashFlow && !financial) {
    const c = annualCashFlow;
    const fcfMargin = pct(c.freeCashFlow, latest?.totalRevenue);
    cashBlock =
      `  CASH FLOW (${fyLabel(c.date)}):\n` +
      `    Operating CF ${fmtAmount(c.operatingCashFlow)} | CapEx ${fmtAmount(c.capitalExpenditure)} | ` +
      `Free CF ${fmtAmount(c.freeCashFlow)} | FCF Margin ${fmtPct(fcfMargin)}\n`;
  }

  // ---- Quarterly momentum (latest reported quarter, YoY) ----
  let quarterBlock = '';
  if (latestQ) {
    const revYoY = yearAgoQ ? pct(latestQ.totalRevenue - yearAgoQ.totalRevenue, yearAgoQ.totalRevenue) : null;
    const niYoY = (yearAgoQ && yearAgoQ.netIncome) ? pct(latestQ.netIncome - yearAgoQ.netIncome, yearAgoQ.netIncome) : null;
    quarterBlock =
      `  QUARTERLY MOMENTUM (${quarterLabel(latestQ.date)}, most recent):\n` +
      `    Revenue ${fmtAmount(latestQ.totalRevenue)}${revYoY != null ? ` (YoY ${fmtSigned(revYoY)})` : ''} | ` +
      `Net Income ${fmtAmount(latestQ.netIncome)}${niYoY != null ? ` (YoY ${fmtSigned(niYoY)})` : ''}\n`;
  }

  const modelNote = financial
    ? `  NOTE: ${sector || 'Financial'} issuer — gross/operating margin, EBITDA, Net Debt, coverage, ` +
      `current ratio and free cash flow do NOT apply to this business model and are deliberately omitted. ` +
      `Judge it on revenue/income growth, net margin, ROE/ROA and capitalisation.\n`
    : '';

  return `Financial Statements (source: Yahoo Finance; figures in the company's OWN reporting currency — NOT necessarily ILS, so do not treat as agorot; "—" = line item not reported under this company's statement structure):\n` +
    modelNote +
    `  INCOME (annual):\n` +
    `${incomeLines.join('\n')}\n` +
    trendLine +
    balanceBlock +
    cashBlock +
    quarterBlock;
}

router.post('/', async (req, res, next) => {
  try {
    const { query } = req.body || {};
    // Output language for the AI narrative. We only generate one language per
    // request (halves output tokens vs the old bilingual payload); the frontend
    // re-requests the other language on demand. Cache is keyed by ticker+lang.
    const lang = req.body?.lang === 'he' ? 'he' : 'en';

    if (!query || typeof query !== 'string' || query.length > 100) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    // SSE setup
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Accepts a ticker ("TEVA") or a company name ("bank leumi"). Price data
    // is always fetched live (Yahoo data itself is cached for 60s upstream).
    let realPriceData;
    try {
      const bundle = await loadTASEStock(query);
      realPriceData = bundle.stockData;
    } catch (yahooErr) {
      if (yahooErr.status === 404) {
        sendEvent('error', {
          error: 'Symbol not found on TASE',
          suggestions: yahooErr.suggestions || [],
          notFound: true,
        });
      } else {
        sendEvent('error', { error: yahooErr.message || 'Market data unavailable' });
      }
      return res.end();
    }

    // Cache is keyed by the resolved ticker, not the raw search string, so
    // "TEVA" and "teva pharmaceutical" share one cached analysis.
    const cacheKey = `${realPriceData.ticker.toLowerCase()}:${lang}`;
    const cachedAnalysis = getCached(cacheKey);

    if (cachedAnalysis) {
      sendEvent('complete', buildResult(cachedAnalysis, realPriceData, true, lang));
      return res.end();
    }

    const priceInfo = [
      realPriceData.longName || realPriceData.shortName
        ? `Company (from Yahoo Finance, authoritative): ${realPriceData.longName || realPriceData.shortName}`
        : null,
      `TASE Ticker: ${realPriceData.ticker}`,
      `Current Price: ${realPriceData.currentPrice} agorot`,
      `Price Change: ${realPriceData.priceChange?.toFixed(4)}%`,
      realPriceData.marketCap ? `Market Cap: ₪${(realPriceData.marketCap / 1e9).toFixed(1)}B` : null,
      realPriceData.high52 ? `52-Week High: ${realPriceData.high52} agorot` : null,
      realPriceData.low52 ? `52-Week Low: ${realPriceData.low52} agorot` : null,
      realPriceData.pe ? `P/E Ratio: ${realPriceData.pe}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    // Financial statements are best-effort: Yahoo's fundamentals endpoint can
    // be slow or missing for some tickers, and that must never block an
    // analysis that otherwise only needs the price snapshot above.
    let financialsSummary = null;
    try {
      const financialsRecord = await getFinancials(realPriceData.ticker);
      financialsSummary = summarizeFinancials(financialsRecord, { sector: realPriceData.sector });
    } catch (financialsErr) {
      console.error('[financials fetch error]', financialsErr.message);
    }

    const outputLanguage = lang === 'he' ? 'Hebrew' : 'English';
    const userMessage = `Analyze this TASE stock: ${query}\n\nCurrent market data (as of ${new Date(realPriceData.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })}):\n${priceInfo}\n\nThe "Company" field above is the authoritative TASE-listed company for this ticker — do NOT confuse it with similarly-named tickers on other exchanges.${financialsSummary ? `\n\n${financialsSummary}` : ''}\n\nOutput language: ${outputLanguage}`;

    let buffer = '';
    let tokensReceived = 0;

    try {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 3000,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          buffer += event.delta.text;
          tokensReceived += 1;
          // Throttle progress events to every 8 deltas to avoid SSE chatter
          if (tokensReceived % 8 === 0) {
            sendEvent('progress', { received: buffer.length });
          }
        }
      }
    } catch (err) {
      console.error('[claude stream error]', err.message);
      sendEvent('error', { error: 'Analysis service unavailable' });
      return res.end();
    }

    const cleaned = buffer.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[parse error]', parseErr.message, buffer.slice(0, 500));
      sendEvent('error', { error: 'Could not parse analysis response' });
      return res.end();
    }

    setCached(cacheKey, parsed);
    sendEvent('complete', buildResult(parsed, realPriceData, false, lang));
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return next(err);
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Internal error' })}\n\n`);
    res.end();
  }
});

export default router;
