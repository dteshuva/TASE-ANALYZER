import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { t } = useI18n();
  const { login, submitting } = useAuth();
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password || submitting) return;
    setFailed(false);
    const ok = await login(password);
    if (!ok) setFailed(true);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">T</div>
          <span className="auth-title">{t.auth.title}</span>
        </div>
        <p className="auth-sub">{t.auth.subtitle}</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFailed(false); }}
            placeholder={t.auth.passwordPlaceholder}
            autoFocus
            autoComplete="current-password"
          />
          <div className="auth-error">{failed ? t.auth.error : ''}</div>
          <button className="auth-btn" type="submit" disabled={submitting || !password}>
            {submitting ? t.auth.submitting : t.auth.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
