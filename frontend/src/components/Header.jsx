import { NavLink } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Header() {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">T</div>
        <span>{t.brand}</span>
        <span className="brand-sub">/ {t.brandSub}</span>
      </div>

      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          {t.nav.analyze}
        </NavLink>
        <NavLink to="/watchlist" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          {t.nav.watchlist}
        </NavLink>
        <NavLink to="/about" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          {t.nav.about}
        </NavLink>
      </nav>

      <div className="lang-toggle">
        <button className={'lang-btn' + (lang === 'en' ? ' active' : '')} onClick={() => setLang('en')}>EN</button>
        <button className={'lang-btn' + (lang === 'he' ? ' active' : '')} onClick={() => setLang('he')}>עב</button>
      </div>
    </header>
  );
}
