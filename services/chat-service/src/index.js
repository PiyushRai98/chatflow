const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./utils/config');
const { socketAuthMiddleware } = require('./middleware/socketAuth');
const { registerChatHandlers } = require('./handlers/chatHandler');
const { startRedisSubscriber } = require('./handlers/redisSub');
const { connectProducer, disconnectProducer } = require('./utils/kafka');

const app = express();
const server = http.createServer(app);

// Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB max message size
  transports: ['websocket', 'polling'],
});

// Express middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

// Health endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    connections: io.engine.clientsCount,
    timestamp: Date.now(),
  });
});

// Socket.io authentication middleware
io.use(socketAuthMiddleware);

// Socket.io connection handler
io.on('connection', (socket) => {
  registerChatHandlers(io, socket);
});

// REST endpoints for chat management
app.get('/api/chats/online-count', (req, res) => {
  res.json({ count: io.engine.clientsCount });
});

async function start() {
  try {
    // Connect Kafka producer
    await connectProducer();
    console.log('[chat-service] Kafka producer connected');

    // Start Redis pub/sub listener for cross-server message delivery
    startRedisSubscriber(io);

    server.listen(config.port, () => {
      console.log(`[chat-service] Running on port ${config.port} (${config.nodeEnv})`);
      console.log(`[chat-service] WebSocket server ready`);
    });
  } catch (err) {
    console.error('[chat-service] Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[chat-service] Shutting down...');

  // Close all socket connections
  io.disconnectSockets(true);

  await disconnectProducer();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();

module.exports = { app, io, server };
