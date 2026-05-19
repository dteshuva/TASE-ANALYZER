import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fetchYahooStockData, fetchYahooHistory, searchTASEStocks } from '../services/yahooFinance.js';

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000;

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
  "analysisEn": string (2-3 paragraph English analysis: business outlook, key risks, near-term catalysts),
  "analysisHe": string (2-3 paragraph Hebrew analysis covering the same ground),
  "bullishPct": number (0-100, your estimated probability of price increase over 12 months),
  "verdict": "BUY" | "HOLD" | "SELL",
  "targetBear": number (conservative 12-month price target in AGOROT),
  "targetBull": number (optimistic 12-month price target in AGOROT),
  "keyRisks": [string, string, string] (3 short bullet points in English),
  "keyRisksHe": [string, string, string] (3 short bullet points in Hebrew),
  "catalysts": [string, string, string] (3 short bullet points in English),
  "catalystsHe": [string, string, string] (3 short bullet points in Hebrew)
}

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

PRICE TARGETS
targetBear and targetBull are 12-month price targets, in agorot. They should bracket the current
price asymmetrically based on the verdict:
  - BUY: targetBull should be 15-40% above current; targetBear typically 0% to -10%.
  - HOLD: targets within roughly ±15% of current.
  - SELL: targetBear should be 15-40% below current; targetBull typically 0% to +10%.
Do not produce flat targets equal to current price.

ANALYSIS QUALITY
Base the analysis on real knowledge of the company: its business segments, recent results,
competitive position, regulatory environment, and sector trends. Be realistic and nuanced;
avoid generic boilerplate. Hebrew text must be natural Hebrew, not transliteration.
Each "analysisEn" / "analysisHe" should be 2-3 short paragraphs, not a single block.

KEY RISKS / CATALYSTS
Exactly 3 items each. Short — each item ≤ 12 words. Specific to the company, not generic
("competition" alone is not acceptable; "intensifying Chinese generics competition in oncology" is).
Hebrew bullets must mirror the English ones in meaning but be natural Hebrew phrasings.

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

router.post('/', async (req, res, next) => {
  try {
    const { query } = req.body || {};

    if (!query || typeof query !== 'string' || query.length > 100) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    const cacheKey = query.trim().toLowerCase();
    const cached = getCached(cacheKey);

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

    if (cached) {
      sendEvent('complete', { ...cached, cached: true });
      return res.end();
    }

    let realPriceData, chartData;
    try {
      [realPriceData, chartData] = await Promise.all([
        fetchYahooStockData(query),
        fetchYahooHistory(query),
      ]);
    } catch (yahooErr) {
      if (yahooErr.status === 404) {
        const suggestions = await searchTASEStocks(query).catch(() => []);
        sendEvent('error', { error: 'Symbol not found on TASE', suggestions, notFound: true });
      } else {
        sendEvent('error', { error: yahooErr.message || 'Market data unavailable' });
      }
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

    const userMessage = `Analyze this TASE stock: ${query}\n\nCurrent market data (as of ${new Date(realPriceData.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })}):\n${priceInfo}\n\nThe "Company" field above is the authoritative TASE-listed company for this ticker — do NOT confuse it with similarly-named tickers on other exchanges.`;

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

    // Override with Yahoo's ground-truth values so Claude can't drift.
    const result = {
      ...parsed,
      cached: false,
      companyName: realPriceData.longName || realPriceData.shortName || parsed.companyName,
      currentPrice: realPriceData.currentPrice ?? parsed.currentPrice,
      priceChange: realPriceData.priceChange ?? parsed.priceChange,
      high52: realPriceData.high52 ?? parsed.high52,
      low52: realPriceData.low52 ?? parsed.low52,
      pe: realPriceData.pe != null ? String(realPriceData.pe) : parsed.pe,
      marketCap: realPriceData.marketCap != null
        ? `₪${(realPriceData.marketCap / 1e9).toFixed(1)}B`
        : parsed.marketCap,
      realPriceData,
      priceDataFresh: true,
      chartData,
    };

    setCached(cacheKey, result);
    sendEvent('complete', result);
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
