const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initDatabase } = require('./models/database');
const { createRedisClient } = require('./utils/redis');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { errorHandler } = require('./middleware/errorHandler');
const config = require('./utils/config');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan('combined'));
}

// Health check — no auth required, used by k8s probes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: config.serviceName, timestamp: Date.now() });
});

app.get('/ready', async (req, res) => {
  try {
    const { pool } = require('./models/database');
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler
app.use(errorHandler);

async function start() {
  try {
    await initDatabase();
    console.log('[auth-service] Database initialized');

    const redis = createRedisClient();
    redis.on('connect', () => console.log('[auth-service] Redis connected'));
    redis.on('error', (err) => console.error('[auth-service] Redis error:', err.message));
    app.locals.redis = redis;

    app.listen(config.port, () => {
      console.log(`[auth-service] Running on port ${config.port} (${config.nodeEnv})`);
    });
  } catch (err) {
    console.error('[auth-service] Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[auth-service] SIGTERM received, shutting down...');
  process.exit(0);
});

start();

module.exports = app; // For testing
