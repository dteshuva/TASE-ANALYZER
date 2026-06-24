import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar.jsx';
import StockCard from '../components/StockCard.jsx';
import AnalysisPanel from '../components/AnalysisPanel.jsx';
import { fetchQuote, streamAnalysis } from '../services/api.js';
import { getCached, setCached } from '../services/cache.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';

// The stock cache is keyed by normalized text so a back-navigation (which
// arrives as the resolved ".TA" ticker, e.g. ?q=TEVA.TA) hits the entry stored
// under the original search and vice-versa — see the dual-key store below.
const keyFor = (s) => `stock:${String(s).trim().toLowerCase()}`;

// Mirrors AnalysisPanel's check — whether a cached stock already carries AI
// analysis or only the bare quote (it streams in a beat after the quote).
const hasAnalysis = (s) => Boolean(s?.analysis || s?.verdict);

export default function AnalyzePage() {
  const { t, lang } = useI18n();
  const { aiEnabled } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [stock, setStock] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const streamRef = useRef(null);

  // Streams the AI analysis and merges it into the stock, re-caching the
  // enriched result under every key the stock is stored as. Reused by a fresh
  // fetch and by a cache hit whose analysis hadn't finished before navigation.
  const startAnalysis = useCallback(
    (query, cacheKeys, reqLang) => {
      setLoadingAnalysis(true);
      setAnalysisProgress(0);
      streamRef.current = streamAnalysis(query, {
        lang: reqLang,
        onProgress: (p) => setAnalysisProgress(p?.received || 0),
        onComplete: (full) => {
          setLoadingAnalysis(false);
          setStock((prev) => {
            const merged = { ...(prev || {}), ...full, chartData: full.chartData || prev?.chartData };
            cacheKeys.forEach((k) => setCached(k, merged));
            return merged;
          });
        },
        onError: (err) => {
          setLoadingAnalysis(false);
          setAnalysisError(err.error || t.states.error);
        },
      });
    },
    [t]
  );

  const runAnalysis = useCallback(
    async (query) => {
      // Cancel any in-flight stream from a previous query
      streamRef.current?.abort();

      setLoadingQuote(true);
      setLoadingAnalysis(false);
      setError('');
      setAnalysisError('');
      setSuggestions([]);
      setStock(null);
      setSearchParams({ q: query });

      const queryKey = keyFor(query);
      const cached = getCached(queryKey);
      if (cached) {
        setStock(cached);
        setLoadingQuote(false);
        // Re-stream the analysis if it's missing (aborted before it finished) or
        // was generated in a different language than the one now selected — the
        // backend only produces one language per request.
        if (aiEnabled && (!hasAnalysis(cached) || cached.lang !== lang)) {
          startAnalysis(query, [queryKey, keyFor(cached.ticker)], lang);
        }
        return;
      }

      let quote;
      try {
        quote = await fetchQuote(query);
      } catch (e) {
        setLoadingQuote(false);
        if (e.notFound) {
          setSuggestions(e.suggestions || []);
          setError(e.suggestions?.length ? t.states.notFound : t.states.notFoundNoSuggestions);
        } else {
          setError(t.states.error);
        }
        return;
      }

      // Store under both the raw search text and the resolved ".TA" ticker, so a
      // later back-navigation (?q=TEVA.TA) and a re-typed search (TEVA) both hit.
      const cacheKeys = [queryKey, keyFor(quote.ticker)];
      setStock(quote);
      cacheKeys.forEach((k) => setCached(k, quote));
      setLoadingQuote(false);

      // AI analysis disabled in settings — show live data only, make no Claude request.
      if (!aiEnabled) {
        setLoadingAnalysis(false);
        return;
      }

      startAnalysis(query, cacheKeys, lang);
    },
    [setSearchParams, t, aiEnabled, startAnalysis, lang]
  );

  useEffect(() => {
    if (initialQuery && !stock && !loadingQuote) {
      runAnalysis(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the UI language changes after an analysis has loaded, regenerate it in
  // the new language (the backend caches per-language, so subsequent toggles are
  // fast). The bare quote is kept — only the AI narrative is re-streamed.
  useEffect(() => {
    if (!stock || !aiEnabled || !hasAnalysis(stock) || stock.lang === lang) return;
    streamRef.current?.abort();
    const q = searchParams.get('q') || stock.ticker;
    startAnalysis(stock.ticker, [keyFor(q), keyFor(stock.ticker)], lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => () => streamRef.current?.abort(), []);

  const showEmpty = !loadingQuote && !stock && !error;

  return (
    <div className="page">
      <SearchBar onSearch={runAnalysis} loading={loadingQuote || loadingAnalysis} initialValue={initialQuery} />

      {error && (
        <div className="error-banner">
          ⚠ {error}
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((s) => (
                <button
                  key={s.ticker}
                  className="suggestion-chip"
                  onClick={() => runAnalysis(s.ticker)}
                >
                  {s.ticker} — {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loadingQuote && (
        <div className="card">
          <div className="loading-state">
            <div className="spinner" />
            <div className="loading-text">{t.states.loading}</div>
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">{t.states.empty}</div>
            <div className="empty-sub">{t.states.emptySub}</div>
          </div>
        </div>
      )}

      {stock && (
        <div className={'analysis-grid' + (aiEnabled ? '' : ' single')}>
          <div className="col">
            <StockCard stock={stock} />
          </div>
          {aiEnabled && (
            <div className="col">
              <AnalysisPanel
                stock={stock}
                loading={loadingAnalysis}
                progress={analysisProgress}
                error={analysisError}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
