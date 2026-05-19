import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { translations } from './translations.js';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('tase_lang');
    if (saved === 'en' || saved === 'he') return saved;
    // Default to Hebrew if browser is Hebrew, else English
    return navigator.language?.startsWith('he') ? 'he' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('tase_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: translations[lang],
      dir: lang === 'he' ? 'rtl' : 'ltr',
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be inside I18nProvider');
  return ctx;
}
