import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const SettingsContext = createContext(null);

const THEME_KEY = 'tase_theme';
const AI_KEY = 'tase_ai_enabled';

function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // Respect the OS preference on first visit; default to dark otherwise.
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initialAiEnabled() {
  // Default ON — only an explicit "false" opts out.
  return localStorage.getItem(AI_KEY) !== 'false';
}

// Apply the theme eagerly at module load so light-mode users don't see a dark flash
// before the provider's effect runs on first paint.
document.documentElement.dataset.theme = initialTheme();

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const [aiEnabled, setAiEnabled] = useState(initialAiEnabled);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(AI_KEY, String(aiEnabled));
  }, [aiEnabled]);

  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );
  const toggleAi = useCallback(() => setAiEnabled((prev) => !prev), []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, aiEnabled, setAiEnabled, toggleAi }),
    [theme, aiEnabled, toggleTheme, toggleAi]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}
