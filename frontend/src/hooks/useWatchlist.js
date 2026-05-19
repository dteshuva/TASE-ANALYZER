import { useState, useEffect, useCallback } from 'react';

const KEY = 'tase_watchlist';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function useWatchlist() {
  const [items, setItems] = useState(read);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((stock) => {
    setItems((prev) => {
      if (prev.some((s) => s.ticker === stock.ticker)) return prev;
      const entry = {
        ticker: stock.ticker,
        companyName: stock.companyName,
        companyNameHe: stock.companyNameHe,
        currentPrice: stock.currentPrice,
        verdict: stock.verdict,
        addedAt: Date.now(),
      };
      const next = [entry, ...prev];
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((ticker) => {
    setItems((prev) => {
      const next = prev.filter((s) => s.ticker !== ticker);
      write(next);
      return next;
    });
  }, []);

  const has = useCallback(
    (ticker) => items.some((s) => s.ticker === ticker),
    [items]
  );

  return { items, add, remove, has };
}
