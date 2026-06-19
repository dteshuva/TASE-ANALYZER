import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import analyzeRouter from './routes/analyze.js';
import quoteRouter from './routes/quote.js';
import quotesRouter from './routes/quotes.js';
import searchRouter from './routes/search.js';
import financialsRouter from './routes/financials.js';
import loginRouter from './routes/login.js';
import { requireAuth, authEnabled } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Most hosts (Railway, Render, Fly, etc.) put the app behind a reverse proxy.
// Trust one proxy hop so express-rate-limit keys on the real client IP (via
// X-Forwarded-For) instead of treating every request as coming from the proxy.
app.set('trust proxy', 1);

// CORS — only allow listed origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);

app.use(express.json({ limit: '64kb' }));

// Rate limit: 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use('/api', limiter);

// Stricter limit for the login endpoint to slow password brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lets the frontend know whether a login is required before showing its UI.
app.get('/api/auth-status', (req, res) => {
  res.json({ authEnabled });
});

// Public: exchange the password for a token. Everything below requires auth.
app.use('/api/login', loginLimiter, loginRouter);
app.use('/api', requireAuth);

// Mount routes (all protected by requireAuth above)
app.use('/api/quote', quoteRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/search', searchRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/financials', financialsRouter);

// Error handler. Log full details server-side, but don't leak internal error
// messages (stack traces, library internals) to clients on 5xx in production.
app.use((err, req, res, next) => {
  console.error('[error]', err.stack || err.message);
  const status = err.status || 500;
  const exposeMessage = status < 500 || process.env.NODE_ENV !== 'production';
  res.status(status).json({
    error: exposeMessage ? err.message || 'Error' : 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`✓ TASE Analyzer backend running on http://localhost:${PORT}`);
  console.log(`  Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`  Auth: ${authEnabled ? 'ENABLED (password required)' : 'DISABLED (set APP_PASSWORD to require login)'}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY not set — requests to /api/analyze will fail.');
  }
});
