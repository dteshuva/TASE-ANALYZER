import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { searchStocks } from '../services/api.js';

export default function SearchBar({ onSearch, loading, initialValue = '' }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  // Skip the next debounced fetch after a programmatic setQuery (chip/selection),
  // so picking a result doesn't immediately reopen the dropdown.
  const skipNextFetch = useRef(false);

  // Debounced autocomplete as the user types.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = setTimeout(async () => {
      const { results: r } = await searchStocks(q);
      setResults(r || []);
      setOpen((r || []).length > 0);
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const submit = () => {
    if (query.trim()) {
      setOpen(false);
      onSearch(query.trim());
    }
  };

  const choose = (item) => {
    skipNextFetch.current = true;
    setQuery(item.name);
    setResults([]);
    setOpen(false);
    onSearch(item.ticker);
  };

  const onChip = (chip) => {
    skipNextFetch.current = true;
    setQuery(chip);
    setOpen(false);
    onSearch(chip);
  };

  return (
    <>
      <div className="search-bar" ref={boxRef}>
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              else if (e.key === 'Escape') setOpen(false);
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={t.search.placeholder}
            aria-label={t.search.placeholder}
            autoComplete="off"
          />
          {open && results.length > 0 && (
            <ul className="autocomplete">
              {results.map((r) => (
                // onMouseDown (not onClick) so selection fires before input blur.
                <li className="autocomplete-item" key={r.ticker} onMouseDown={() => choose(r)}>
                  <span className="ac-ticker">{r.ticker}</span>
                  <span className="ac-name">{r.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="analyze-btn"
          onClick={submit}
          disabled={loading || !query.trim()}
        >
          {t.search.button}
        </button>
      </div>

      <div className="suggestions">
        <span className="suggestions-label">{t.search.suggestions}</span>
        {t.search.chips.map((chip) => (
          <button key={chip} className="chip" onClick={() => onChip(chip)}>
            {chip}
          </button>
        ))}
      </div>
    </>
  );
}
