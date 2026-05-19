import { useI18n } from '../i18n/I18nContext.jsx';

export default function Footer() {
  const { t } = useI18n();
  return <footer className="footer">⚠ {t.footer.disclaimer}</footer>;
}
