import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useWatchlist } from '../hooks/useWatchlist.js';

export default function StockCard({ stock }) {
  const { t, lang } = useI18n();
  const { has, add, remove } = useWatchlist();
  const inWatchlist = has(stock.ticker);

  const displayName =
    lang === 'he' && stock.companyNameHe ? stock.companyNameHe : stock.companyName;

  const chartData = stock.chartData || [];
  const minPrice = chartData.length ? Math.min(...chartData.map((d) => d.price)) * 0.96 : 0;
  const maxPrice = chartData.length ? Math.max(...chartData.map((d) => d.price)) * 1.04 : 100;

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
        </div>
      </div>

      <div className="chart-title">{t.stock.chartTitle}</div>
      <div className="chart-wrap">
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
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="month"
              tick={{ fill: '#65798c', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fill: '#65798c', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}`}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'rgba(13, 21, 32, 0.96)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                fontFamily: 'IBM Plex Mono',
                fontSize: 11,
                padding: '8px 10px',
                boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)',
              }}
              labelStyle={{ color: '#65798c', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em' }}
              itemStyle={{ color: chartColor, fontWeight: 600 }}
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
                stroke: '#0d1520',
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
