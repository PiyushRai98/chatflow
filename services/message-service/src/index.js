const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const Chat = require('./models/Chat');
const { startConsumer, stopConsumer } = require('./consumers/messageConsumer');
const { getPresignedUploadUrl, validateFile, ALLOWED_MIME_TYPES } = require('./utils/s3');
const config = require('./utils/config');

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json());

// Auth middleware
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: config.serviceName, timestamp: Date.now() });
});

// ── Chat Management ──

// Create a new chat (direct or group)
app.post('/api/chats', authenticateToken, async (req, res, next) => {
  try {
    const { type, participants, name, description } = req.body;

    if (!type || !participants?.length) {
      return res.status(400).json({ error: 'type and participants required' });
    }

    // For direct chats, check if one already exists between the two users
    if (type === 'direct') {
      if (participants.length !== 1) {
        return res.status(400).json({ error: 'Direct chat requires exactly one other participant' });
      }

      const existingChat = await Chat.findOne({
        type: 'direct',
        'participants.userId': { $all: [req.user.id, participants[0].userId] },
        $expr: { $eq: [{ $size: '$participants' }, 2] },
      });

      if (existingChat) {
        return res.json({ chat: existingChat, existing: true });
      }
    }

    // Build participant list including the creator
    const allParticipants = [
      {
        userId: req.user.id,
        username: req.user.username,
        role: type === 'group' ? 'admin' : 'member',
      },
      ...participants.map(p => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        role: 'member',
      })),
    ];

    const chatId = type === 'direct'
      ? [req.user.id, participants[0].userId].sort().join(':')
      : `group:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    const chat = new Chat({
      chatId,
      type,
      name: type === 'group' ? name : undefined,
      description: type === 'group' ? description : undefined,
      participants: allParticipants,
      createdBy: req.user.id,
    });

    await chat.save();
    res.status(201).json({ chat });
  } catch (err) {
    next(err);
  }
});

// List user's chats
app.get('/api/chats', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;

    const chats = await Chat.find({
      'participants.userId': req.user.id,
    })
      .sort({ 'lastMessage.timestamp': -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10))
      .lean();

    res.json({ chats, page: parseInt(page, 10) });
  } catch (err) {
    next(err);
  }
});

// Get chat messages with cursor-based pagination
app.get('/api/chats/:chatId/messages', authenticateToken, async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { before, limit = 50 } = req.query;

    // Verify user is a participant
    const chat = await Chat.findOne({
      chatId,
      'participants.userId': req.user.id,
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const query = { chatId, deleted: false };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    res.json({
      messages: messages.reverse(), // Return oldest-first
      hasMore: messages.length === parseInt(limit, 10),
    });
  } catch (err) {
    next(err);
  }
});

// Get unread count per chat
app.get('/api/chats/unread', authenticateToken, async (req, res, next) => {
  try {
    const chats = await Chat.find({
      'participants.userId': req.user.id,
    }).lean();

    const unreadCounts = {};

    for (const chat of chats) {
      const participant = chat.participants.find(p => p.userId === req.user.id);
      const lastReadAt = participant?.lastReadAt || new Date(0);

      const count = await Message.countDocuments({
        chatId: chat.chatId,
        senderId: { $ne: req.user.id },
        createdAt: { $gt: lastReadAt },
        deleted: false,
      });

      if (count > 0) {
        unreadCounts[chat.chatId] = count;
      }
    }

    res.json({ unreadCounts });
  } catch (err) {
    next(err);
  }
});

// Mark messages as read
app.post('/api/chats/:chatId/read', authenticateToken, async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const now = new Date();

    // Update participant's last read timestamp
    await Chat.updateOne(
      { chatId, 'participants.userId': req.user.id },
      {
        $set: {
          'participants.$.lastReadAt': now,
        },
      }
    );

    // Update message read receipts
    await Message.updateMany(
      {
        chatId,
        senderId: { $ne: req.user.id },
        'readBy.userId': { $ne: req.user.id },
      },
      {
        $push: {
          readBy: { userId: req.user.id, timestamp: now },
        },
        $set: { status: 'read' },
      }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Media Upload ──

// Get presigned upload URL for S3
app.post('/api/media/upload-url', authenticateToken, async (req, res, next) => {
  try {
    const { chatId, fileName, mimeType, fileSize } = req.body;

    if (!chatId || !fileName || !mimeType) {
      return res.status(400).json({ error: 'chatId, fileName, and mimeType required' });
    }

    validateFile(mimeType, fileSize || 0);

    const result = await getPresignedUploadUrl(chatId, fileName, mimeType);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(`[${req.method} ${req.path}]`, err.message);
  const status = err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

async function start() {
  try {
    await mongoose.connect(config.mongodb.uri, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[message-service] MongoDB connected');

    await startConsumer();
    console.log('[message-service] Kafka consumer started');

    app.listen(config.port, () => {
      console.log(`[message-service] Running on port ${config.port}`);
    });
  } catch (err) {
    console.error('[message-service] Failed to start:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await stopConsumer();
  await mongoose.disconnect();
  process.exit(0);
});

start();

module.exports = app;
