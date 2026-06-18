import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, getToken, clearToken, fetchAuthStatus } from '../services/api';

const AuthContext = createContext(null);

// status: 'checking' (deciding if a login is needed) | 'locked' (show login) | 'unlocked'
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // On startup, ask the backend whether a password is required.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enabled = await fetchAuthStatus();
      if (cancelled) return;
      setAuthEnabled(enabled);
      if (!enabled) setStatus('unlocked');
      else setStatus(getToken() ? 'unlocked' : 'locked');
    })();
    return () => { cancelled = true; };
  }, []);

  // A rejected/expired token anywhere in the app bounces us back to login.
  useEffect(() => {
    const onExpired = () => setStatus('locked');
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (password) => {
    setSubmitting(true);
    try {
      await apiLogin(password);
      setStatus('unlocked');
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setStatus('locked');
  }, []);

  return (
    <AuthContext.Provider value={{ status, authEnabled, submitting, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
