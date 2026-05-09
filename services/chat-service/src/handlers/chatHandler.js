const { v4: uuidv4 } = require('uuid');
const { SocketEvents } = require('@chat/types');
const { publishChatMessage, publishNotification } = require('../utils/kafka');
const {
  setUserOnline,
  setUserOffline,
  getUserPresence,
  setTyping,
  clearTyping,
  getPubClient,
} = require('../utils/redis');

const SERVER_ID = `chat-${process.pid}-${Date.now()}`;

function registerChatHandlers(io, socket) {
  const userId = socket.userId;
  const username = socket.username;

  // ──────────────────────────────────────
  // Connection setup
  // ──────────────────────────────────────

  async function onConnect() {
    try {
      await setUserOnline(userId, socket.id, SERVER_ID);

      // Join personal room for direct delivery
      socket.join(`user:${userId}`);

      // Broadcast presence to all connected clients
      const pubClient = getPubClient();
      await pubClient.publish('presence', JSON.stringify({
        type: 'online',
        userId,
        username,
        timestamp: Date.now(),
      }));

      console.log(`[chat] User ${username} (${userId}) connected on ${SERVER_ID}`);
    } catch (err) {
      console.error(`[chat] Connection setup failed for ${username}:`, err.message);
    }
  }

  // ──────────────────────────────────────
  // Messaging
  // ──────────────────────────────────────

  async function onSendMessage(data, ack) {
    try {
      const { chatId, content, type = 'text', replyTo, media } = data;

      if (!chatId || !content?.trim()) {
        return ack?.({ error: 'chatId and content required' });
      }

      const message = {
        id: uuidv4(),
        chatId,
        senderId: userId,
        senderUsername: username,
        content: content.trim(),
        type, // text, image, file, audio, video
        replyTo: replyTo || null,
        media: media || null,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };

      // Publish to Kafka for persistence + delivery
      await publishChatMessage(message);

      // Immediate delivery via Redis pub/sub (cross-server)
      const pubClient = getPubClient();
      await pubClient.publish('chat:messages', JSON.stringify({
        chatId,
        message,
      }));

      // Acknowledge to sender
      ack?.({ success: true, messageId: message.id, timestamp: message.createdAt });
    } catch (err) {
      console.error(`[chat] Send message error:`, err.message);
      ack?.({ error: 'Failed to send message' });
    }
  }

  // ──────────────────────────────────────
  // Read receipts
  // ──────────────────────────────────────

  async function onMessageDelivered(data) {
    const { messageId, chatId } = data;
    if (!messageId || !chatId) return;

    const pubClient = getPubClient();
    await pubClient.publish('chat:receipts', JSON.stringify({
      type: 'delivered',
      messageId,
      chatId,
      userId,
      timestamp: Date.now(),
    }));
  }

  async function onMessageRead(data) {
    const { messageIds, chatId } = data;
    if (!messageIds?.length || !chatId) return;

    const pubClient = getPubClient();
    await pubClient.publish('chat:receipts', JSON.stringify({
      type: 'read',
      messageIds,
      chatId,
      userId,
      timestamp: Date.now(),
    }));
  }

  // ──────────────────────────────────────
  // Typing indicators
  // ──────────────────────────────────────

  async function onTypingStart(data) {
    const { chatId } = data;
    if (!chatId) return;

    await setTyping(chatId, userId, username);

    const pubClient = getPubClient();
    await pubClient.publish('chat:typing', JSON.stringify({
      type: 'start',
      chatId,
      userId,
      username,
    }));
  }

  async function onTypingStop(data) {
    const { chatId } = data;
    if (!chatId) return;

    await clearTyping(chatId, userId);

    const pubClient = getPubClient();
    await pubClient.publish('chat:typing', JSON.stringify({
      type: 'stop',
      chatId,
      userId,
      username,
    }));
  }

  // ──────────────────────────────────────
  // Chat room management
  // ──────────────────────────────────────

  function onJoinChat(data) {
    const { chatId } = data;
    if (!chatId) return;
    socket.join(`chat:${chatId}`);
    console.log(`[chat] ${username} joined chat:${chatId}`);
  }

  function onLeaveChat(data) {
    const { chatId } = data;
    if (!chatId) return;
    socket.leave(`chat:${chatId}`);
  }

  // ──────────────────────────────────────
  // Disconnect
  // ──────────────────────────────────────

  async function onDisconnect(reason) {
    try {
      await setUserOffline(userId);

      const pubClient = getPubClient();
      await pubClient.publish('presence', JSON.stringify({
        type: 'offline',
        userId,
        username,
        timestamp: Date.now(),
      }));

      console.log(`[chat] ${username} disconnected (${reason})`);
    } catch (err) {
      console.error(`[chat] Disconnect cleanup error:`, err.message);
    }
  }

  // ──────────────────────────────────────
  // Register all handlers
  // ──────────────────────────────────────

  onConnect();

  socket.on(SocketEvents.SEND_MESSAGE, onSendMessage);
  socket.on(SocketEvents.MESSAGE_DELIVERED, onMessageDelivered);
  socket.on(SocketEvents.MESSAGE_READ, onMessageRead);
  socket.on(SocketEvents.TYPING_START, onTypingStart);
  socket.on(SocketEvents.TYPING_STOP, onTypingStop);
  socket.on(SocketEvents.JOIN_CHAT, onJoinChat);
  socket.on(SocketEvents.LEAVE_CHAT, onLeaveChat);
  socket.on(SocketEvents.DISCONNECT, onDisconnect);
}

module.exports = { registerChatHandlers, SERVER_ID };
