import { useI18n } from '../i18n/I18nContext.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';

function ToggleRow({ label, desc, on, onToggle, onText, offText }) {
  return (
    <div className="card setting-row">
      <div className="setting-info">
        <div className="setting-label">{label}</div>
        <div className="setting-desc">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${on ? onText : offText}`}
        className={'toggle-switch' + (on ? ' on' : '')}
        onClick={onToggle}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { theme, toggleTheme, aiEnabled, toggleAi } = useSettings();

  return (
    <div className="page">
      <h1 className="page-title">{t.settings.title}</h1>
      <p className="page-sub">{t.settings.subtitle}</p>

      <div className="settings-list">
        <ToggleRow
          label={t.settings.aiLabel}
          desc={t.settings.aiDesc}
          on={aiEnabled}
          onToggle={toggleAi}
          onText={t.settings.aiOn}
          offText={t.settings.aiOff}
        />
        <ToggleRow
          label={t.settings.themeLabel}
          desc={t.settings.themeDesc}
          on={theme === 'light'}
          onToggle={toggleTheme}
          onText={t.settings.themeOn}
          offText={t.settings.themeOff}
        />
      </div>
    </div>
  );
}
