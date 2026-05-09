const { getSubClient } = require('../utils/redis');
const { SocketEvents } = require('@chat/types');

/**
 * Redis Pub/Sub subscriber — bridges messages between multiple chat-service instances.
 *
 * When user A on server-1 sends a message to user B on server-2:
 * 1. Server-1 publishes to Redis channel 'chat:messages'
 * 2. Server-2 (this subscriber) picks it up and emits to the local socket room
 *
 * This is what makes horizontal scaling of WebSocket servers work.
 */
function startRedisSubscriber(io) {
  const sub = getSubClient();

  sub.subscribe('chat:messages', 'chat:receipts', 'chat:typing', 'presence');

  sub.on('message', (channel, rawMessage) => {
    try {
      const data = JSON.parse(rawMessage);

      switch (channel) {
        case 'chat:messages':
          handleIncomingMessage(io, data);
          break;
        case 'chat:receipts':
          handleReceipt(io, data);
          break;
        case 'chat:typing':
          handleTyping(io, data);
          break;
        case 'presence':
          handlePresence(io, data);
          break;
      }
    } catch (err) {
      console.error(`[redis-sub] Error on channel ${channel}:`, err.message);
    }
  });

  console.log('[redis-sub] Listening on chat:messages, chat:receipts, chat:typing, presence');
}

function handleIncomingMessage(io, data) {
  const { chatId, message } = data;

  // Emit to all users in the chat room on this server instance
  io.to(`chat:${chatId}`).emit(SocketEvents.MESSAGE_RECEIVED, {
    chatId,
    message,
  });
}

function handleReceipt(io, data) {
  const { type, messageId, messageIds, chatId, userId, timestamp } = data;

  if (type === 'delivered') {
    io.to(`chat:${chatId}`).emit(SocketEvents.MESSAGE_DELIVERED, {
      messageId,
      chatId,
      userId,
      timestamp,
    });
  } else if (type === 'read') {
    io.to(`chat:${chatId}`).emit(SocketEvents.MESSAGE_READ, {
      messageIds,
      chatId,
      userId,
      timestamp,
    });
  }
}

function handleTyping(io, data) {
  const { type, chatId, userId, username } = data;

  io.to(`chat:${chatId}`).emit(SocketEvents.USER_TYPING, {
    chatId,
    userId,
    username,
    isTyping: type === 'start',
  });
}

function handlePresence(io, data) {
  const { type, userId, username, timestamp } = data;

  const event = type === 'online' ? SocketEvents.USER_ONLINE : SocketEvents.USER_OFFLINE;
  io.emit(event, { userId, username, timestamp });
}

module.exports = { startRedisSubscriber };
