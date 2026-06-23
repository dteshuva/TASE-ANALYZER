import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { fetchHistory } from '../services/api.js';

const RANGES = ['1y', '5y'];

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthAbbrev = (isoDate) => MONTH_ABBREVS[Number(isoDate.slice(5, 7)) - 1];

export default function StockCard({ stock }) {
  const { t, lang } = useI18n();
  const { has, add, remove } = useWatchlist();
  const inWatchlist = has(stock.ticker);

  const displayName =
    lang === 'he' && stock.companyNameHe ? stock.companyNameHe : stock.companyName;

  // Every range (incl. the default 1y) is lazy-loaded via /api/history rather
  // than bundled with the quote — this keeps the heavy ~250-bar daily series off
  // the quote's critical path so the card paints immediately and the chart fills
  // in a beat later. Each range is fetched once then cached in state.
  const [range, setRange] = useState('1y');
  const [history, setHistory] = useState({});
  const [loadingRange, setLoadingRange] = useState(null);
  const [errorRange, setErrorRange] = useState(null);

  const chartData = history[range] || [];

  const loadRange = async (r) => {
    setLoadingRange(r);
    setErrorRange(null);
    try {
      const { chartData: data } = await fetchHistory(stock.ticker, r);
      setHistory((prev) => ({ ...prev, [r]: data }));
    } catch {
      setErrorRange(r);
    } finally {
      setLoadingRange(null);
    }
  };

  // Load the default 1y series on mount, and reset/reload when the card is
  // reused for a different ticker.
  useEffect(() => {
    setRange('1y');
    setHistory({});
    setErrorRange(null);
    loadRange('1y');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.ticker]);

  const selectRange = (r) => {
    if (r === range) return;
    setRange(r);
    setErrorRange(null);
    if (!history[r]) loadRange(r);
  };

  const minPrice = chartData.length ? Math.min(...chartData.map((d) => d.price)) * 0.96 : 0;
  const maxPrice = chartData.length ? Math.max(...chartData.map((d) => d.price)) * 1.04 : 100;

  // Show one X-axis tick per month (1y) or per year (5y) instead of one per
  // data point — with daily/weekly bars that would overlap into an unreadable
  // smear. The tooltip still shows the exact day/week via `label`.
  const tickDates = useMemo(() => {
    if (!chartData.length) return new Set();
    const keyOf = (dateStr) =>
      range === '5y' ? dateStr.slice(0, 4) : dateStr.slice(0, 7);
    const seen = new Set();
    const ticks = new Set();
    for (const d of chartData) {
      if (!d.date) continue;
      const key = keyOf(d.date);
      if (!seen.has(key)) {
        seen.add(key);
        ticks.add(d.date);
      }
    }
    return ticks;
  }, [chartData, range]);

  // Color chart based on overall trend across the visible range
  const trendUp =
    chartData.length >= 2
      ? chartData[chartData.length - 1].price >= chartData[0].price
      : true;
  const chartColor = trendUp ? '#2ee6b0' : '#ff5778';
  const gradientId = `chartGradient-${stock.ticker?.replace(/\./g, '-')}`;

  const toggle = () => {
    if (inWatchlist) remove(stock.ticker);
    else add(stock);
  };

  return (
    <div className="card">
      <div className="stock-header">
        <div className="stock-meta">
          <div className="stock-name">{displayName}</div>
          <div className="stock-ticker">{stock.ticker} · TASE</div>
          {stock.sector && (
            <div className="stock-sector" title={stock.industry || undefined}>{stock.sector}</div>
          )}
        </div>
        <div className="price-block">
          <div className="price">{stock.currentPrice?.toLocaleString()}</div>
          <div className={'price-change ' + (stock.priceChange >= 0 ? 'up' : 'down')}>
            {stock.priceChange >= 0 ? '▲ +' : '▼ '}
            {stock.priceChange?.toFixed(2)}%
          </div>
          <button
            className={'watchlist-toggle' + (inWatchlist ? ' active' : '')}
            onClick={toggle}
          >
            {inWatchlist ? '★ ' + t.stock.removeWatchlist : '☆ ' + t.stock.addWatchlist}
          </button>
          <Link className="watchlist-toggle" to={`/financials/${stock.ticker}`}>
            {t.stock.viewFinancials}
          </Link>
        </div>
      </div>

      <div className="chart-header">
        <div className="chart-title">
          {range === '1y' ? t.stock.chartTitle1y : t.stock.chartTitle5y}
        </div>
        <div className="range-toggle">
          {RANGES.map((r) => (
            <button
              key={r}
              className={r === range ? 'active' : ''}
              onClick={() => selectRange(r)}
            >
              {loadingRange === r ? '…' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        {loadingRange === range && (
          <div className="chart-overlay">{t.stock.chartLoading}</div>
        )}
        {errorRange === range && loadingRange !== range && (
          <div className="chart-overlay">
            <span>{t.stock.chartError}</span>
            <button className="chart-retry" onClick={() => loadRange(range)}>
              {t.stock.chartRetry}
            </button>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
              tickFormatter={(date) => {
                if (!tickDates.has(date)) return '';
                return range === '5y' ? date.slice(0, 4) : monthAbbrev(date);
              }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}`}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border-hover)', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                fontFamily: 'IBM Plex Mono',
                fontSize: 11,
                padding: '8px 10px',
                boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)',
              }}
              labelStyle={{ color: 'var(--muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em' }}
              itemStyle={{ color: chartColor, fontWeight: 600 }}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.label ?? label ?? ''}
              formatter={(v) => [v.toLocaleString(), 'Price']}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={chartColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{
                r: 4,
                fill: chartColor,
                stroke: 'var(--surface)',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {stock.performance && (
        <div className="perf-row">
          <span className="perf-label">{t.stock.return12m}</span>
          <span className={'perf-val ' + (stock.performance.stock >= 0 ? 'up' : 'down')}>
            {stock.performance.stock >= 0 ? '+' : ''}{stock.performance.stock}%
          </span>
          <span className="perf-bench">
            {t.stock.vs} {stock.performance.benchmarkName}{' '}
            <span className={stock.performance.benchmark >= 0 ? 'up' : 'down'}>
              {stock.performance.benchmark >= 0 ? '+' : ''}{stock.performance.benchmark}%
            </span>
          </span>
        </div>
      )}

      {stock.sectorComparison && (
        stock.sectorComparison.sectorReturn != null ? (
          <div className="perf-row sector-row">
            <span className="perf-label">{t.stock.vsSector}</span>
            <span className="sector-name">
              {t.sectors[stock.sectorComparison.sectorKey] || stock.sectorComparison.sectorName}
            </span>
            <span className="perf-bench">
              {stock.sectorComparison.sectorReturn >= 0 ? '+' : ''}{stock.sectorComparison.sectorReturn}%
            </span>
            <span
              className={
                'sector-delta ' +
                (stock.sectorComparison.delta >= 3 ? 'up' : stock.sectorComparison.delta <= -3 ? 'down' : 'flat')
              }
            >
              {stock.sectorComparison.delta >= 0 ? '+' : ''}{stock.sectorComparison.delta}pp
            </span>
          </div>
        ) : (
          <div className="perf-row sector-row">
            <span className="perf-label">{t.stock.vsSector}</span>
            <span className="sector-name">
              {t.sectors[stock.sectorComparison.sectorKey] || stock.sectorComparison.sectorName}
            </span>
            <span className="perf-bench muted">{t.stock.sectorUpdating}</span>
          </div>
        )
      )}

      <div className="metrics">
        <Metric label={t.stock.marketCap} value={stock.marketCap} />
        <Metric label={t.stock.pe} value={stock.pe} />
        <Metric label={t.stock.high52} value={stock.high52?.toLocaleString?.() ?? stock.high52} />
        <Metric label={t.stock.low52} value={stock.low52?.toLocaleString?.() ?? stock.low52} />
        <Metric label={t.stock.volume} value={stock.volume != null ? stock.volume.toLocaleString() : null} />
        {stock.avgVolume != null && (
          <Metric label={t.stock.avgVolume} value={stock.avgVolume.toLocaleString()} />
        )}
        {stock.dividendYield != null && (
          <Metric label={t.stock.dividendYield} value={(stock.dividendYield * 100).toFixed(2) + '%'} />
        )}
      </div>

      {stock.news?.length > 0 && (
        <div className="news-section">
          <div className="news-title">{t.stock.news}</div>
          <ul className="news-list">
            {stock.news.map((n, i) => (
              <li className="news-item" key={i}>
                <a className="news-link" href={n.link} target="_blank" rel="noopener noreferrer">
                  {n.title}
                </a>
                <div className="news-meta">
                  {n.publisher}
                  {n.publisher && n.time ? ' · ' : ''}
                  {n.time
                    ? new Date(n.time).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value ?? '—'}</div>
    </div>
  );
}
