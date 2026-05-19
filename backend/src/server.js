import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import analyzeRouter from './routes/analyze.js';
import quoteRouter from './routes/quote.js';

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/quote', quoteRouter);
app.use('/api/analyze', analyzeRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`✓ TASE Analyzer backend running on http://localhost:${PORT}`);
  console.log(`  Allowed origins: ${allowedOrigins.join(', ')}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY not set — requests to /api/analyze will fail.');
  }
});
