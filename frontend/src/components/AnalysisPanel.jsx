import { useI18n } from '../i18n/I18nContext.jsx';

export default function AnalysisPanel({ stock, loading, error }) {
  const { t, lang } = useI18n();

  const hasAnalysis = stock?.analysisEn || stock?.analysisHe || stock?.verdict;

  if (error) {
    return (
      <div className="card">
        <div className="card-title">{t.analysis.title}</div>
        <div className="error-banner">⚠ {error}</div>
      </div>
    );
  }

  if (loading || !hasAnalysis) {
    return (
      <div className="card">
        <div className="card-title">{t.analysis.title}</div>
        <div className="ai-badge">
          <span className="ai-dot" />
          {t.analysis.poweredBy}
        </div>
        <div className="analysis-skeleton">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-block" />
          <div className="skeleton-line short" />
          <div className="skeleton-line short" />
        </div>
      </div>
    );
  }

  const analysisText = lang === 'he' ? stock.analysisHe : stock.analysisEn;
  const risks = lang === 'he' ? stock.keyRisksHe : stock.keyRisks;
  const catalysts = lang === 'he' ? stock.catalystsHe : stock.catalysts;

  const verdictClass = stock.verdict?.toLowerCase() || 'hold';
  const verdictLabel = t.verdicts[stock.verdict] || stock.verdict;

  const fillColor = stock.bullishPct >= 50 ? 'var(--accent)' : 'var(--danger)';

  // Conviction reflects how far the bullish probability sits from a 50/50 coin flip.
  const convictionDist = Math.abs((stock.bullishPct ?? 50) - 50);
  const convictionKey =
    convictionDist >= 20 ? 'high' : convictionDist >= 10 ? 'moderate' : 'low';

  return (
    <div className="card">
      <div className="card-title">{t.analysis.title}</div>
      <div className="badge-row">
        <div className="ai-badge">
          <span className="ai-dot" />
          {t.analysis.poweredBy}
        </div>
      </div>

      <div className="analysis-text">
        {analysisText?.split('\n\n').map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      <div className="prediction-section">
        <div className="pred-label">{t.analysis.bullish}</div>
        <div className="pred-bar-wrap">
          <div className="pred-bar">
            <div
              className="pred-fill"
              style={{ width: `${stock.bullishPct}%`, background: fillColor }}
            />
          </div>
          <div className="pred-score" style={{ color: fillColor }}>
            {stock.bullishPct}%
          </div>
        </div>
        <div className="verdict-row">
          <div className={'verdict ' + verdictClass}>{verdictLabel}</div>
          <span className="conviction-label">{t.analysis.conviction[convictionKey]}</span>
        </div>
      </div>

      <div className="targets">
        <div className="target">
          <div className="target-label">{t.analysis.targetBear}</div>
          <div className="target-val down">{stock.targetBear?.toLocaleString?.() ?? stock.targetBear}</div>
        </div>
        <div className="target">
          <div className="target-label">{t.analysis.targetBull}</div>
          <div className="target-val up">{stock.targetBull?.toLocaleString?.() ?? stock.targetBull}</div>
        </div>
      </div>

      {catalysts?.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="pred-label">{t.analysis.catalysts}</div>
          <ul className="bullet-list">
            {catalysts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {risks?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="pred-label">{t.analysis.risks}</div>
          <ul className="bullet-list risks">
            {risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
