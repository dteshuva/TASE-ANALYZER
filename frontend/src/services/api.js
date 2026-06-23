import { getCached, setCached } from './cache.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ---- Auth token storage -----------------------------------------------------
// The bearer token is kept in localStorage so a returning user is not asked for
// the password again. It is attached to every API request below.
const TOKEN_KEY = 'tase_auth_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Build request headers, attaching the bearer token when we have one.
function authHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// Called when the server rejects our token. Drops it and signals the app to
// bounce the user back to the login screen.
function onUnauthorized() {
  clearToken();
  window.dispatchEvent(new Event('auth:expired'));
}

// Whether the backend requires a login. Used at startup to decide between the
// login screen and going straight into the app. Fails closed (assume auth
// required) if the backend can't be reached.
export async function fetchAuthStatus() {
  try {
    const res = await fetch(`${API_URL}/api/auth-status`);
    if (!res.ok) return true;
    const body = await res.json();
    return !!body.authEnabled;
  } catch {
    return true;
  }
}

// Exchange the shared password for a token (stored on success). Returns the
// token (which is null when the backend has auth disabled).
export async function login(password) {
  const res = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed: ${res.status}`);
  }
  const { token } = await res.json();
  setToken(token);
  return token;
}

// ---- Data endpoints ---------------------------------------------------------

export async function fetchQuote(query) {
  const res = await fetch(`${API_URL}/api/quote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.notFound = res.status === 404;
    err.suggestions = errBody.suggestions || [];
    throw err;
  }

  return res.json();
}

// Batch price lookup for the watchlist — one request for many tickers.
// Returns { quotes: [{ ticker, currentPrice, priceChange, ... } | { ticker, error }] }.
export async function fetchQuotes(tickers) {
  const res = await fetch(`${API_URL}/api/quotes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ tickers }),
  });

  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// Lazy-loaded price history for a non-default range (currently just 5y/weekly
// — the 1y/daily series ships bundled with /api/quote already).
export async function fetchHistory(ticker, range) {
  const cacheKey = `history:${ticker}:${range}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${API_URL}/api/history`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ticker, range }),
  });

  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  setCached(cacheKey, data);
  return data;
}

// Autocomplete search — returns { results: [{ ticker, name }] } for the search bar.
export async function searchStocks(query) {
  try {
    const res = await fetch(`${API_URL}/api/search`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      if (res.status === 401) onUnauthorized();
      return { results: [] };
    }
    return res.json();
  } catch {
    return { results: [] };
  }
}

// Financial statements (income statement / balance sheet / cash flow), annual
// and quarterly. Cached server-side for up to 7 days since these only change
// when a company files a new report.
export async function fetchFinancials(ticker) {
  const res = await fetch(`${API_URL}/api/financials`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ticker }),
  });

  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.notFound = res.status === 404;
    throw err;
  }

  return res.json();
}

// Streams /api/analyze as SSE. Returns a controller with an abort() method.
// onProgress/onComplete/onError fire as the stream produces events.
export function streamAnalysis(query, { onProgress, onComplete, onError } = {}) {
  const controller = new AbortController();

  (async () => {
    let res;
    try {
      res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: authHeaders({ Accept: 'text/event-stream' }),
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name !== 'AbortError') onError?.({ error: e.message });
      return;
    }

    if (!res.ok) {
      if (res.status === 401) onUnauthorized();
      const body = await res.json().catch(() => ({}));
      onError?.({
        error: body.error || `Request failed: ${res.status}`,
        notFound: res.status === 404,
        suggestions: body.suggestions || [],
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let idx;
        while ((idx = pending.indexOf('\n\n')) !== -1) {
          const frame = pending.slice(0, idx);
          pending = pending.slice(idx + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          if (parsed.event === 'complete') onComplete?.(parsed.data);
          else if (parsed.event === 'error') onError?.(parsed.data);
          else if (parsed.event === 'progress') onProgress?.(parsed.data);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') onError?.({ error: e.message });
    }
  })();

  return controller;
}

function parseSseFrame(frame) {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}
