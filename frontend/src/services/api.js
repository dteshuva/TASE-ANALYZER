const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function fetchQuote(query) {
  const res = await fetch(`${API_URL}/api/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// Autocomplete search — returns { results: [{ ticker, name }] } for the search bar.
export async function searchStocks(query) {
  try {
    const res = await fetch(`${API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { results: [] };
    return res.json();
  } catch {
    return { results: [] };
  }
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
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name !== 'AbortError') onError?.({ error: e.message });
      return;
    }

    if (!res.ok) {
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
