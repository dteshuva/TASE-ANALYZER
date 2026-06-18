import crypto from 'crypto';

// The single shared password is configured via env. If it is unset, auth is
// DISABLED (the API is open) — convenient for local dev. Set APP_PASSWORD in
// production to require a login.
const APP_PASSWORD = process.env.APP_PASSWORD || '';

export const authEnabled = !!APP_PASSWORD;

// Deterministic, non-reversible bearer token derived from the password. The
// client stores this (not the password). Changing APP_PASSWORD invalidates
// every previously issued token.
export function tokenFor(password) {
  return crypto.createHash('sha256').update(`tase-auth::${password}`).digest('hex');
}

const VALID_TOKEN = authEnabled ? tokenFor(APP_PASSWORD) : null;

// Constant-time comparison of two equal-length hex strings.
function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// Verify a submitted password. Returns the bearer token on success, else null.
export function verifyPassword(password) {
  if (!authEnabled || typeof password !== 'string') return null;
  return timingSafeHexEqual(tokenFor(password), VALID_TOKEN) ? VALID_TOKEN : null;
}

// Express middleware. Rejects requests that don't carry a valid bearer token.
// When auth is disabled, every request passes through.
export function requireAuth(req, res, next) {
  if (!authEnabled) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token && timingSafeHexEqual(token, VALID_TOKEN)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}
