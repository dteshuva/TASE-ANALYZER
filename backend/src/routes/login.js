import express from 'express';
import { verifyPassword, authEnabled } from '../auth.js';

const router = express.Router();

// Exchange the shared password for a bearer token. The client stores the token
// and sends it on every subsequent request, so the password is only entered
// once per device.
router.post('/', (req, res) => {
  // No password configured server-side: let the client through with no token.
  if (!authEnabled) return res.json({ token: null, authDisabled: true });

  const { password } = req.body || {};
  const token = verifyPassword(password);
  if (!token) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token });
});

export default router;
