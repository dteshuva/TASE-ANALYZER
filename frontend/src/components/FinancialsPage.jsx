import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchFinancials } from '../services/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const STATEMENTS = [
  { key: 'income', titleKey: 'income' },
  { key: 'balanceSheet', titleKey: 'balanceSheet' },
  { key: 'cashFlow', titleKey: 'cashFlow' },
];

// Per-share figures must NOT be scaled to millions like the currency amounts.
const EPS_KEYS = new Set(['basicEPS', 'dilutedEPS']);

// Section totals / headline lines — emphasized so the eye lands on them first.
const EMPHASIS_KEYS = new Set([
  'totalRevenue',
  'grossProfit',
  'operatingIncome',
  'netIncome',
  'totalAssets',
  'totalLiabilitiesNetMinorityInterest',
  'stockholdersEquity',
  'freeCashFlow',
  'endCashPosition',
]);

// Returns the display text plus a class signalling negative / not-available so
// the cell can be coloured. Currency amounts are shown in millions with the
// accounting convention of parentheses for negatives; EPS is left as-is.
function formatAmount(key, value) {
  if (value == null) return { text: '—', cls: 'fin-na' };
  if (EPS_KEYS.has(key)) {
    return { text: value.toFixed(2), cls: value < 0 ? 'fin-neg' : '' };
  }
  const millions = value / 1e6;
  const abs = Math.abs(millions).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return millions < 0 ? { text: `(${abs})`, cls: 'fin-neg' } : { text: abs, cls: '' };
}

function periodLabel(date, quarterly) {
  const d = new Date(date);
  if (quarterly) return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${String(d.getUTCFullYear()).slice(2)}`;
  return String(d.getUTCFullYear());
}

export default function FinancialsPage() {
  const { ticker } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('annual');
  const [activeTab, setActiveTab] = useState('income');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchFinancials(ticker);
      setData(result);
    } catch (e) {
      setError(e.notFound ? t.financials.noData : t.financials.error);
    } finally {
      setLoading(false);
    }
  }, [ticker, t]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page fin-page">
      <Link className="page-back" to={`/?q=${ticker}`}>← {t.financials.back}</Link>

      <div className="fin-head">
        <div>
          <div className="page-title">{t.financials.title}</div>
          <div className="fin-sub">{ticker} · TASE</div>
        </div>
        {data && !loading && !error && (
          <span className="fin-updated">
            {t.financials.updatedAt} {new Date(data.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {loading && (
        <div className="card">
          <div className="loading-state">
            <div className="spinner" />
            <div className="loading-text">{t.financials.loading}</div>
          </div>
        </div>
      )}

      {!loading && error && <div className="error-banner">⚠ {error}</div>}

      {!loading && !error && data && (
        <>
          <div className="fin-tabs" role="tablist">
            {STATEMENTS.map(({ key, titleKey }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                className={'fin-tab' + (activeTab === key ? ' active' : '')}
                onClick={() => setActiveTab(key)}
              >
                {t.financials[titleKey]}
              </button>
            ))}
          </div>

          <div className="fin-controls">
            <div className="fin-segment">
              <button
                className={'fin-seg-btn' + (period === 'annual' ? ' active' : '')}
                onClick={() => setPeriod('annual')}
              >
                {t.financials.annual}
              </button>
              <button
                className={'fin-seg-btn' + (period === 'quarterly' ? ' active' : '')}
                onClick={() => setPeriod('quarterly')}
              >
                {t.financials.quarterly}
              </button>
            </div>
            <span className="fin-unit">{t.financials.unitNote}</span>
          </div>

          <StatementTable
            rows={data[period][activeTab]}
            quarterly={period === 'quarterly'}
            labels={t.financials.lineItems}
            emptyText={t.financials.noData}
          />
        </>
      )}
    </div>
  );
}

function StatementTable({ rows, quarterly, labels, emptyText }) {
  // Yahoo often returns a leading period with every line item null — drop any
  // such all-empty column so the table doesn't show a wall of dashes.
  const periods = (rows || []).filter((r) =>
    Object.entries(r).some(([k, v]) => k !== 'date' && v != null)
  );

  if (periods.length === 0) {
    return (
      <div className="card fin-card fin-card-empty">
        <div className="empty-sub">{emptyText}</div>
      </div>
    );
  }

  const lineKeys = Object.keys(periods[0]).filter((k) => k !== 'date');
  const lastIdx = periods.length - 1;

  return (
    <div className="card fin-card">
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th className="fin-th-label" scope="col"></th>
              {periods.map((r, i) => (
                <th key={r.date} scope="col" className={i === lastIdx ? 'fin-col-latest' : ''}>
                  {periodLabel(r.date, quarterly)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineKeys.map((key) => (
              <tr key={key} className={EMPHASIS_KEYS.has(key) ? 'fin-row-emph' : ''}>
                <th scope="row" className="fin-row-label">{labels[key] || key}</th>
                {periods.map((r, i) => {
                  const { text, cls } = formatAmount(key, r[key]);
                  return (
                    <td key={r.date} className={(i === lastIdx ? 'fin-col-latest ' : '') + cls}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}

          </tbody>
        </table>
      </div>
    </div>
  );
}
