import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';
import { fetchQuote, streamAnalysis, searchStocks } from '../services/api.js';
import { localSearchStocks, mergeStockResults } from '../data/taseStocks.js';

// Compact autocomplete search box used for each side of the comparison.
function CompareSearch({ label, placeholder, onSelect }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    // Instant local TA-125 match, then a debounced Yahoo search for the long tail.
    const local = localSearchStocks(q);
    setResults(local);
    setOpen(local.length > 0);
    if (local.length >= 7) return;

    let cancelled = false;
    const id = setTimeout(async () => {
      const { results: remote } = await searchStocks(q);
      if (cancelled) return;
      const merged = mergeStockResults(local, remote);
      setResults(merged);
      setOpen(merged.length > 0);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const submit = () => {
    if (text.trim()) {
      setOpen(false);
      onSelect(text.trim());
    }
  };
  const choose = (item) => {
    skipNextFetch.current = true;
    setText(item.name);
    setResults([]);
    setOpen(false);
    onSelect(item.ticker);
  };

  return (
    <div className="compare-search" ref={boxRef}>
      <span className="compare-label">{label}</span>
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'Escape') setOpen(false);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
          aria-label={label}
        />
        {open && results.length > 0 && (
          <ul className="autocomplete">
            {results.map((r) => (
              <li className="autocomplete-item" key={r.ticker} onMouseDown={() => choose(r)}>
                <span className="ac-ticker">{r.ticker}</span>
                <span className="ac-name">{r.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const VERDICT_RANK = { BUY: 3, HOLD: 2, SELL: 1 };
const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
// Winner for a numeric pair. higherBetter flips the comparison. Equal/missing → null.
const winnerOf = (a, b, higherBetter = true) => {
  if (a == null || b == null || a === b) return null;
  const aWins = higherBetter ? a > b : a < b;
  return aWins ? 'A' : 'B';
};
const convictionKey = (pct) => {
  const d = Math.abs((pct ?? 50) - 50);
  return d >= 20 ? 'high' : d >= 10 ? 'moderate' : 'low';
};

function CmpRow({ label, a, b, winner }) {
  return (
    <div className="cmp-row">
      <div className="cmp-label">{label}</div>
      <div className={'cmp-cell' + (winner === 'A' ? ' win' : '')}>{a}</div>
      <div className={'cmp-cell' + (winner === 'B' ? ' win' : '')}>{b}</div>
    </div>
  );
}

function AiColumn({ stock, t, lang }) {
  const verdictClass = stock.verdict?.toLowerCase() || 'hold';
  const risks = lang === 'he' ? stock.keyRisksHe : stock.keyRisks;
  const catalysts = lang === 'he' ? stock.catalystsHe : stock.catalysts;
  return (
    <div className="cmp-ai-col">
      <div className="cmp-ai-head">
        {(lang === 'he' && stock.companyNameHe ? stock.companyNameHe : stock.companyName)}{' '}
        <span className="cmp-ai-ticker">{stock.ticker}</span>
      </div>
      <div className="cmp-ai-verdict">
        <span className={'verdict ' + verdictClass} style={{ marginTop: 0 }}>
          {t.verdicts[stock.verdict] || stock.verdict}
        </span>
        <span className="conviction-label">{t.analysis.conviction[convictionKey(stock.bullishPct)]}</span>
      </div>
      {catalysts?.length > 0 && (
        <div className="cmp-ai-block">
          <div className="pred-label">{t.analysis.catalysts}</div>
          <ul className="bullet-list">{catalysts.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {risks?.length > 0 && (
        <div className="cmp-ai-block">
          <div className="pred-label">{t.analysis.risks}</div>
          <ul className="bullet-list risks">{risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const { t, lang } = useI18n();
  const { aiEnabled } = useSettings();
  const [stocks, setStocks] = useState({ A: null, B: null });
  const [loading, setLoading] = useState({ A: false, B: false });
  const [errors, setErrors] = useState({ A: '', B: '' });
  const streamRefs = useRef({ A: null, B: null });

  const patch = (setter, side, val) =>
    setter((prev) => ({ ...prev, [side]: typeof val === 'function' ? val(prev[side]) : val }));

  const load = useCallback(
    async (side, query) => {
      streamRefs.current[side]?.abort();
      patch(setErrors, side, '');
      patch(setStocks, side, null);
      patch(setLoading, side, true);

      let quote;
      try {
        quote = await fetchQuote(query);
      } catch (e) {
        patch(setLoading, side, false);
        patch(setErrors, side, e.notFound ? t.states.notFoundNoSuggestions : t.states.error);
        return;
      }
      patch(setStocks, side, quote);

      // AI analysis disabled in settings — keep the quote-only comparison, make no Claude request.
      if (!aiEnabled) {
        patch(setLoading, side, false);
        return;
      }

      streamRefs.current[side] = streamAnalysis(query, {
        onComplete: (full) => {
          patch(setLoading, side, false);
          patch(setStocks, side, (prev) => ({ ...(prev || {}), ...full, chartData: full.chartData || prev?.chartData }));
        },
        onError: () => {
          patch(setLoading, side, false); // keep the quote; AI just unavailable
        },
      });
    },
    [t, aiEnabled]
  );

  useEffect(() => () => {
    streamRefs.current.A?.abort();
    streamRefs.current.B?.abort();
  }, []);

  const A = stocks.A;
  const B = stocks.B;
  const bothLoaded = A && B;
  const hasAI = bothLoaded && A.verdict && B.verdict;

  // Summary line (rule-based, from the existing AI verdicts).
  let summary = null;
  if (hasAI) {
    const ra = VERDICT_RANK[A.verdict] || 0;
    const rb = VERDICT_RANK[B.verdict] || 0;
    if (ra !== rb) {
      // Different verdicts — the higher-ranked one wins outright.
      const winner = ra > rb ? A : B;
      summary = t.compare.summaryStrongerTpl.replace('{t}', winner.ticker);
    } else {
      // Same verdict — still give a signal by breaking the tie on bullish probability.
      const aP = A.bullishPct ?? 0;
      const bP = B.bullishPct ?? 0;
      if (aP === bP) {
        summary = t.compare.summarySimilar;
      } else {
        const winner = aP > bP ? A : B;
        const loser = aP > bP ? B : A;
        summary = t.compare.summaryTieTpl
          .replace('{verdict}', t.verdicts[winner.verdict] || winner.verdict)
          .replace('{t}', winner.ticker)
          .replace('{x}', String(winner.bullishPct))
          .replace('{y}', String(loser.bullishPct));
      }
    }
  }

  // Precompute comparison values (only meaningful when both loaded).
  const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + n + '%');
  // Directional arrow + magnitude, so "bear case" downside reads clearly (e.g. ↓12.5%).
  const arrowPct = (n) => (n == null ? '' : `${n >= 0 ? '↑' : '↓'}${Math.abs(n)}%`);
  const upside = (s) =>
    s?.targetBull != null && s?.currentPrice ? +(((s.targetBull - s.currentPrice) / s.currentPrice) * 100).toFixed(1) : null;
  const downside = (s) =>
    s?.targetBear != null && s?.currentPrice ? +(((s.targetBear - s.currentPrice) / s.currentPrice) * 100).toFixed(1) : null;
  const peNum = (s) => {
    const n = toNum(s?.pe);
    return n != null && n > 0 ? n : null; // negative/zero/missing P/E is not a valid "lower is better" comparison
  };
  const peDisplay = (s) => {
    const raw = s?.pe;
    const n = toNum(raw);
    if (n != null && n <= 0) return `${raw} (${t.compare.negativePe})`;
    return raw ?? '—';
  };
  const divDisplay = (s) => (s?.dividendYield != null ? (s.dividendYield * 100).toFixed(2) + '%' : '—');
  const divNum = (s) => (s?.dividendYield != null && s.dividendYield > 0 ? s.dividendYield : null);

  return (
    <div className="page">
      <h1 className="page-title">{t.compare.title}</h1>
      <p className="page-sub">{t.compare.subtitle}</p>

      <div className="compare-inputs">
        <div>
          <CompareSearch label={t.compare.stockA} placeholder={t.compare.placeholder} onSelect={(q) => load('A', q)} />
          {errors.A && <div className="compare-err">⚠ {errors.A}</div>}
        </div>
        <div className="compare-vs">{t.stock.vs}</div>
        <div>
          <CompareSearch label={t.compare.stockB} placeholder={t.compare.placeholder} onSelect={(q) => load('B', q)} />
          {errors.B && <div className="compare-err">⚠ {errors.B}</div>}
        </div>
      </div>

      {!bothLoaded && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">⚖</div>
            <div className="empty-title">{t.compare.empty}</div>
            <div className="empty-sub">{t.compare.emptySub}</div>
          </div>
        </div>
      )}

      {bothLoaded && (
        <>
          {summary && <div className="cmp-summary">{summary}</div>}

          <div className="card cmp-table">
            <div className="cmp-row cmp-colhead">
              <div className="cmp-label">{t.compare.metricsTitle}</div>
              <div className="cmp-cell cmp-name">
                {(lang === 'he' && A.companyNameHe ? A.companyNameHe : A.companyName)}
                <span className="cmp-name-ticker">{A.ticker}</span>
              </div>
              <div className="cmp-cell cmp-name">
                {(lang === 'he' && B.companyNameHe ? B.companyNameHe : B.companyName)}
                <span className="cmp-name-ticker">{B.ticker}</span>
              </div>
            </div>

            <CmpRow
              label={t.compare.price}
              a={A.currentPrice?.toLocaleString()}
              b={B.currentPrice?.toLocaleString()}
            />
            <CmpRow
              label={t.compare.todayChange}
              a={A.priceChange != null ? pct(+A.priceChange.toFixed(2)) : '—'}
              b={B.priceChange != null ? pct(+B.priceChange.toFixed(2)) : '—'}
              winner={winnerOf(A.priceChange ?? null, B.priceChange ?? null, true)}
            />
            {hasAI && (
              <>
                <CmpRow
                  label={t.analysis.verdict}
                  a={`${t.verdicts[A.verdict] || A.verdict} · ${A.bullishPct}%`}
                  b={`${t.verdicts[B.verdict] || B.verdict} · ${B.bullishPct}%`}
                  winner={
                    (VERDICT_RANK[A.verdict] || 0) !== (VERDICT_RANK[B.verdict] || 0)
                      ? winnerOf(VERDICT_RANK[A.verdict] || 0, VERDICT_RANK[B.verdict] || 0)
                      : winnerOf(A.bullishPct, B.bullishPct)
                  }
                />
                <CmpRow
                  label={t.analysis.targetBull}
                  a={A.targetBull != null ? `${A.targetBull.toLocaleString()}  ${arrowPct(upside(A))}` : '—'}
                  b={B.targetBull != null ? `${B.targetBull.toLocaleString()}  ${arrowPct(upside(B))}` : '—'}
                  winner={winnerOf(upside(A), upside(B), true)}
                />
                <CmpRow
                  label={t.analysis.targetBear}
                  a={A.targetBear != null ? `${A.targetBear.toLocaleString()}  ${arrowPct(downside(A))}` : '—'}
                  b={B.targetBear != null ? `${B.targetBear.toLocaleString()}  ${arrowPct(downside(B))}` : '—'}
                  winner={winnerOf(downside(A), downside(B), true)}
                />
              </>
            )}
            <CmpRow
              label={t.stock.return12m}
              a={pct(A.performance?.stock ?? null)}
              b={pct(B.performance?.stock ?? null)}
              winner={winnerOf(A.performance?.stock ?? null, B.performance?.stock ?? null, true)}
            />
            <CmpRow
              label={t.stock.pe}
              a={peDisplay(A)}
              b={peDisplay(B)}
              winner={winnerOf(peNum(A), peNum(B), false)}
            />
            <CmpRow
              label={t.stock.dividendYield}
              a={divDisplay(A)}
              b={divDisplay(B)}
              winner={winnerOf(divNum(A), divNum(B), true)}
            />
            <CmpRow label={t.stock.marketCap} a={A.marketCap ?? '—'} b={B.marketCap ?? '—'} />
            <CmpRow
              label={`${t.stock.low52} / ${t.stock.high52}`}
              a={`${A.low52?.toLocaleString?.() ?? '—'} – ${A.high52?.toLocaleString?.() ?? '—'}`}
              b={`${B.low52?.toLocaleString?.() ?? '—'} – ${B.high52?.toLocaleString?.() ?? '—'}`}
            />
          </div>

          {hasAI && (
            <div className="card cmp-ai">
              <AiColumn stock={A} t={t} lang={lang} />
              <AiColumn stock={B} t={t} lang={lang} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
