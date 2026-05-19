import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useWatchlist } from '../hooks/useWatchlist.js';

export default function WatchlistPage() {
  const { t, lang } = useI18n();
  const { items, remove } = useWatchlist();
  const navigate = useNavigate();

  return (
    <div className="page">
      <h1 className="page-title">{t.watchlist.title}</h1>

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
            return (
              <div className="wl-card" key={item.ticker}>
                <div className="wl-header">
                  <div>
                    <div className="wl-name">{name}</div>
                    <div className="wl-ticker">{item.ticker}</div>
                  </div>
                  <div className="wl-price">₪{item.currentPrice?.toFixed(2)}</div>
                </div>
                {item.verdict && (
                  <span className={'verdict ' + verdictClass} style={{ marginTop: 0, alignSelf: 'flex-start' }}>
                    {t.verdicts[item.verdict] || item.verdict}
                  </span>
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
