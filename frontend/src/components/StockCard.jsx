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

const RANGES = ['1m', '3m', '6m', 'ytd', '1y', '5y'];

// Sub-year ranges are sliced client-side from the 1y daily series already
// loaded on mount, instead of a separate fetch — they're strict subsets of
// data we already have, so slicing is both free and instant to switch to.
const SLICED_RANGES = new Set(['1m', '3m', '6m', 'ytd']);

function sliceRange(daily, range) {
  if (!daily.length) return [];
  const cutoff = new Date();
  if (range === '1m') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === '3m') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === 'ytd') {
    cutoff.setMonth(0);
    cutoff.setDate(1);
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return daily.filter((d) => d.date >= cutoffStr);
}

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthAbbrev = (isoDate) => MONTH_ABBREVS[Number(isoDate.slice(5, 7)) - 1];

function formatLargeCurrency(value) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `₪${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `₪${(value / 1e6).toFixed(1)}M`;
  return `₪${value.toLocaleString()}`;
}

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

  // Sliced ranges piggyback on the 1y fetch, so their loading/error state is
  // whatever the 1y request is doing.
  const loadKey = SLICED_RANGES.has(range) ? '1y' : range;
  const chartData = SLICED_RANGES.has(range)
    ? sliceRange(history['1y'] || [], range)
    : history[range] || [];

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
    if (SLICED_RANGES.has(r)) {
      if (!history['1y']) loadRange('1y');
    } else if (!history[r]) {
      loadRange(r);
    }
  };

  const minPrice = chartData.length ? Math.min(...chartData.map((d) => d.price)) * 0.96 : 0;
  const maxPrice = chartData.length ? Math.max(...chartData.map((d) => d.price)) * 1.04 : 100;

  // Show one X-axis tick per month (1y) or per year (5y) instead of one per
  // data point — with daily/weekly bars that would overlap into an unreadable
  // smear. The tooltip still shows the exact day/week via `label`.
  const tickDates = useMemo(() => {
    if (!chartData.length) return new Set();
    // One tick per week for the short ranges (too few days for a monthly tick
    // to be useful), per month for 1y, per year for 5y.
    const keyOf =
      range === '5y'
        ? (dateStr) => dateStr.slice(0, 4)
        : range === '1m' || range === '3m'
        ? (dateStr) => {
            const d = new Date(dateStr);
            const week = Math.floor(d.getDate() / 7);
            return `${dateStr.slice(0, 7)}-w${week}`;
          }
        : (dateStr) => dateStr.slice(0, 7);
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
          {range === '5y' ? t.stock.chartTitle5y : t.stock.chartTitle1y}
        </div>
        <div className="range-toggle">
          {RANGES.map((r) => (
            <button
              key={r}
              className={r === range ? 'active' : ''}
              onClick={() => selectRange(r)}
            >
              {loadingRange === (SLICED_RANGES.has(r) ? '1y' : r) ? '…' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        {loadingRange === loadKey && (
          <div className="chart-overlay">{t.stock.chartLoading}</div>
        )}
        {errorRange === loadKey && loadingRange !== loadKey && (
          <div className="chart-overlay">
            <span>{t.stock.chartError}</span>
            <button className="chart-retry" onClick={() => loadRange(loadKey)}>
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
                if (range === '5y') return date.slice(0, 4);
                if (range === '1m' || range === '3m') {
                  return `${monthAbbrev(date)} ${Number(date.slice(8, 10))}`;
                }
                return monthAbbrev(date);
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
        {stock.previousClose != null && (
          <Metric label={t.stock.previousClose} value={stock.previousClose.toLocaleString()} />
        )}
        {stock.dayLow != null && stock.dayHigh != null && (
          <Metric
            label={t.stock.dayRange}
            value={`${stock.dayLow.toLocaleString()} – ${stock.dayHigh.toLocaleString()}`}
          />
        )}
        <Metric label={t.stock.marketCap} value={stock.marketCap} />
        <Metric label={t.stock.pe} value={stock.pe} />
        {stock.beta != null && <Metric label={t.stock.beta} value={stock.beta.toFixed(2)} />}
        {stock.eps != null && <Metric label={t.stock.eps} value={stock.eps.toFixed(2)} />}
        {stock.totalRevenue != null && (
          <Metric label={t.stock.totalRevenue} value={formatLargeCurrency(stock.totalRevenue)} />
        )}
        {stock.netIncome != null && (
          <Metric label={t.stock.netIncome} value={formatLargeCurrency(stock.netIncome)} />
        )}
        <Metric label={t.stock.high52} value={stock.high52?.toLocaleString?.() ?? stock.high52} />
        <Metric label={t.stock.low52} value={stock.low52?.toLocaleString?.() ?? stock.low52} />
        <Metric label={t.stock.volume} value={stock.volume != null ? stock.volume.toLocaleString() : null} />
        {stock.avgVolume != null && (
          <Metric label={t.stock.avgVolume} value={stock.avgVolume.toLocaleString()} />
        )}
        {stock.dividendYield != null && (
          <Metric label={t.stock.dividendYield} value={(stock.dividendYield * 100).toFixed(2) + '%'} />
        )}
        {stock.exDividendDate && (
          <Metric
            label={t.stock.exDividendDate}
            value={new Date(stock.exDividendDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          />
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
