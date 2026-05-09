const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const promClient = require('prom-client');
require('dotenv').config();

const app = express();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    chat: process.env.CHAT_SERVICE_URL || 'http://localhost:3002',
    message: process.env.MESSAGE_SERVICE_URL || 'http://localhost:3003',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
  },
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'],
};

// ── Prometheus Metrics ──

const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'gateway_' });

const httpRequestDuration = new promClient.Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests through the gateway',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

const httpRequestTotal = new promClient.Counter({
  name: 'gateway_http_requests_total',
  help: 'Total HTTP requests through the gateway',
  labelNames: ['method', 'route', 'status_code'],
});

// Metrics middleware
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
});

// ── Security ──

app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(morgan('short'));

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// ── Health & Metrics ──

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: Date.now() });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ── Service Proxies ──
//
// NOTE: http-proxy-middleware v3 + Express `app.use('/prefix', mw)` strips the
// mount prefix from req.url before the proxy sees it, so we must mount at the
// root and use `pathFilter` to select traffic. Otherwise the upstream service
// receives `/register` instead of `/api/auth/register` and 404s.

const proxyError = (label) => (err, req, res) => {
  console.error(`[gateway] ${label} proxy error:`, err.message);
  if (res && !res.headersSent && typeof res.status === 'function') {
    res.status(502).json({ error: `${label} service unavailable` });
  }
};

// Auth + users → auth-service
app.use(createProxyMiddleware({
  target: config.services.auth,
  changeOrigin: true,
  pathFilter: ['/api/auth/**', '/api/users/**'],
  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      proxyReq.setHeader('X-Request-ID', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    },
    error: proxyError('Auth'),
  },
}));

// Chats + media → message-service
app.use(createProxyMiddleware({
  target: config.services.message,
  changeOrigin: true,
  pathFilter: ['/api/chats/**', '/api/media/**'],
  on: { error: proxyError('Message') },
}));

// Notifications → notification-service
app.use(createProxyMiddleware({
  target: config.services.notification,
  changeOrigin: true,
  pathFilter: ['/api/notifications/**'],
  on: { error: proxyError('Notification') },
}));

// WebSocket proxy → chat-service
const wsProxy = createProxyMiddleware({
  target: config.services.chat,
  changeOrigin: true,
  ws: true,
  pathFilter: ['/socket.io/**'],
  on: { error: proxyError('Chat') },
});
app.use(wsProxy);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(config.port, () => {
  console.log(`[api-gateway] Running on port ${config.port}`);
  console.log('[api-gateway] Routes:');
  console.log(`  /api/auth     → ${config.services.auth}`);
  console.log(`  /api/users    → ${config.services.auth}`);
  console.log(`  /api/chats    → ${config.services.message}`);
  console.log(`  /api/media    → ${config.services.message}`);
  console.log(`  /socket.io    → ${config.services.chat} (WebSocket)`);
  console.log(`  /api/notifications → ${config.services.notification}`);
});

// WebSocket upgrade support — forward Socket.io handshakes to chat-service
server.on('upgrade', wsProxy.upgrade);

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
