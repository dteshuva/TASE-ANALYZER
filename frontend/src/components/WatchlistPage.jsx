import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { fetchQuotes } from '../services/api.js';

export default function WatchlistPage() {
  const { t, lang } = useI18n();
  const { items, remove } = useWatchlist();
  const navigate = useNavigate();

  // Live quotes keyed by ticker: { status: 'loading' | 'ok' | 'error', currentPrice, priceChange }.
  // The stored watchlist only holds a price snapshot from when the stock was added,
  // so we refetch current prices on mount (and on demand) to keep the list live.
  const [live, setLive] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const refresh = useCallback(async () => {
    if (items.length === 0) return;
    setRefreshing(true);
    setLive((prev) => {
      const next = { ...prev };
      for (const it of items) next[it.ticker] = { ...next[it.ticker], status: 'loading' };
      return next;
    });

    try {
      // One batch request for all tickers (the endpoint echoes back each input ticker).
      const { quotes } = await fetchQuotes(items.map((it) => it.ticker));
      const byTicker = {};
      for (const q of quotes) {
        byTicker[q.ticker] = q.error
          ? { status: 'error' }
          : { status: 'ok', currentPrice: q.currentPrice, priceChange: q.priceChange };
      }
      setLive((prev) => {
        const next = { ...prev };
        for (const it of items) next[it.ticker] = byTicker[it.ticker] || { status: 'error' };
        return next;
      });
    } catch {
      // Whole batch failed (e.g. backend down) — mark all errored so cards fall back to snapshot.
      setLive((prev) => {
        const next = { ...prev };
        for (const it of items) next[it.ticker] = { ...next[it.ticker], status: 'error' };
        return next;
      });
    }

    setRefreshedAt(Date.now());
    setRefreshing(false);
  }, [items]);

  // Refresh once on mount when there are saved stocks.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locale = lang === 'he' ? 'he-IL' : 'en-US';

  return (
    <div className="page">
      <div className="watchlist-head">
        <h1 className="page-title" style={{ margin: 0 }}>{t.watchlist.title}</h1>
        {items.length > 0 && (
          <div className="watchlist-status">
            {refreshedAt && !refreshing && (
              <span className="wl-asof">
                {t.watchlist.pricesAsOf}{' '}
                {new Date(refreshedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button className="wl-refresh" onClick={refresh} disabled={refreshing}>
              {refreshing ? t.watchlist.refreshing : '↻ ' + t.watchlist.refresh}
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">☆</div>
            <div className="empty-title">{t.watchlist.empty}</div>
            <div className="empty-sub">{t.watchlist.emptySub}</div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="watchlist-grid">
          {items.map((item) => {
            const name = lang === 'he' && item.companyNameHe ? item.companyNameHe : item.companyName;
            const verdictClass = item.verdict?.toLowerCase() || 'hold';

            const q = live[item.ticker];
            const isLoading = q?.status === 'loading';
            // Prefer the freshly fetched price; fall back to the stored snapshot.
            const price = q?.status === 'ok' ? q.currentPrice : item.currentPrice;
            const change = q?.status === 'ok' ? q.priceChange : null;

            return (
              <div className="wl-card" key={item.ticker}>
                <div className="wl-header">
                  <div>
                    <div className="wl-name">{name}</div>
                    <div className="wl-ticker">{item.ticker}</div>
                  </div>
                  <div className="wl-price-block">
                    <div className={'wl-price' + (isLoading ? ' loading' : '')}>
                      {price != null ? price.toLocaleString() : t.watchlist.priceUnavailable}
                    </div>
                    {change != null && (
                      <div className={'wl-change ' + (change >= 0 ? 'up' : 'down')}>
                        {change >= 0 ? '▲ +' : '▼ '}
                        {change.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
                {item.verdict && (
                  <span className={'verdict ' + verdictClass} style={{ marginTop: 0, alignSelf: 'flex-start' }}>
                    {t.verdicts[item.verdict] || item.verdict}
                  </span>
                )}
                {item.addedAt && (
                  <div className="wl-added">
                    {t.watchlist.addedOn}{' '}
                    {new Date(item.addedAt).toLocaleDateString(locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                )}
                <div className="wl-actions">
                  <button
                    className="wl-btn"
                    onClick={() => navigate(`/?q=${encodeURIComponent(item.ticker)}`)}
                  >
                    {t.watchlist.view}
                  </button>
                  <button className="wl-btn danger" onClick={() => remove(item.ticker)}>
                    {t.watchlist.remove}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
