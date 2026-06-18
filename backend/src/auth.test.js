import { test } from 'node:test';
import assert from 'node:assert/strict';

// auth.js reads APP_PASSWORD once at import time, so set the env var first and
// use a unique query string to bypass the ESM module cache for each scenario.
async function loadAuth(password) {
  if (password === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = password;
  return import(`./auth.js?case=${Math.random()}`);
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('auth disabled when APP_PASSWORD is unset — requests pass through', async () => {
  const { authEnabled, verifyPassword, requireAuth } = await loadAuth(undefined);
  assert.equal(authEnabled, false);
  assert.equal(verifyPassword('anything'), null);

  let nextCalled = false;
  const res = mockRes();
  requireAuth({ headers: {} }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('verifyPassword issues a 64-char token only for the correct password', async () => {
  const { verifyPassword, tokenFor, authEnabled } = await loadAuth('s3cret');
  assert.equal(authEnabled, true);

  const token = verifyPassword('s3cret');
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64);
  assert.equal(token, tokenFor('s3cret'));

  assert.equal(verifyPassword('wrong'), null);
  assert.equal(verifyPassword(''), null);
  assert.equal(verifyPassword(undefined), null);
  assert.equal(verifyPassword(123), null);
});

test('requireAuth accepts a valid bearer token and rejects everything else', async () => {
  const { verifyPassword, requireAuth } = await loadAuth('s3cret');
  const token = verifyPassword('s3cret');

  let okNext = false;
  const okRes = mockRes();
  requireAuth({ headers: { authorization: `Bearer ${token}` } }, okRes, () => { okNext = true; });
  assert.equal(okNext, true);
  assert.equal(okRes.statusCode, 200);

  const badHeaders = ['', 'Bearer wrong', 'wrong', `Basic ${token}`, `Bearer ${token}x`];
  for (const header of badHeaders) {
    let next = false;
    const res = mockRes();
    requireAuth({ headers: header ? { authorization: header } : {} }, res, () => { next = true; });
    assert.equal(next, false, `should reject header: "${header}"`);
    assert.equal(res.statusCode, 401);
  }
});
