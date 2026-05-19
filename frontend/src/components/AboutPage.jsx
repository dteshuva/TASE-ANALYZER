import { useI18n } from '../i18n/I18nContext.jsx';

export default function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="page">
      <h1 className="page-title">{t.about.title}</h1>
      <div className="about-content">
        <p>{t.about.p1}</p>
        <p>{t.about.p2}</p>

        <div className="disclaimer-box">
          <div className="disclaimer-title">⚠ {t.about.disclaimerTitle}</div>
          <div className="disclaimer-text">{t.about.disclaimer}</div>
        </div>
      </div>
    </div>
  );
}
