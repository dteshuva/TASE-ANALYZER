// Tiny in-memory TTL cache, shared across components. Lets the user navigate
// back and forth between the stock page and financials/etc. without
// re-fetching data that's still fresh — the underlying components remount on
// every route change (see App.jsx's key={pathname}), so this cache lives
// outside React state to survive that.
const store = new Map();
const TTL_MS = 5 * 60 * 1000;

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.time > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached(key, value) {
  store.set(key, { value, time: Date.now() });
}
