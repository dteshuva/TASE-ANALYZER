import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function SearchBar({ onSearch, loading, initialValue = '' }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialValue);

  const submit = () => {
    if (query.trim()) onSearch(query.trim());
  };

  const onChip = (chip) => {
    setQuery(chip);
    onSearch(chip);
  };

  return (
    <>
      <div className="search-bar">
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t.search.placeholder}
            aria-label={t.search.placeholder}
          />
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
