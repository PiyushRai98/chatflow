// Shared type definitions and constants for the distributed chat system

// Message status enum
const MessageStatus = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
};

// Chat types
const ChatType = {
  DIRECT: 'direct',
  GROUP: 'group',
};

// Socket event names - single source of truth
const SocketEvents = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  AUTH_ERROR: 'auth_error',

  // Messaging
  SEND_MESSAGE: 'message:send',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_ACK: 'message:ack',
  MESSAGE_FAILED: 'message:failed',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_TYPING: 'user:typing',

  // Presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  PRESENCE_UPDATE: 'presence:update',

  // Chat management
  JOIN_CHAT: 'chat:join',
  LEAVE_CHAT: 'chat:leave',
  CHAT_CREATED: 'chat:created',

  // Media
  MEDIA_UPLOAD_PROGRESS: 'media:upload_progress',
  MEDIA_UPLOAD_COMPLETE: 'media:upload_complete',
};

// Kafka topics
const KafkaTopics = {
  MESSAGES: 'chat.messages',
  MESSAGES_DLQ: 'chat.messages.dlq',
  NOTIFICATIONS: 'chat.notifications',
  PRESENCE: 'chat.presence',
  MEDIA_PROCESSING: 'chat.media',
};

// Redis key prefixes
const RedisKeys = {
  USER_SESSION: 'session:',
  USER_PRESENCE: 'presence:',
  CHAT_TYPING: 'typing:',
  RATE_LIMIT: 'ratelimit:',
  MESSAGE_CACHE: 'msgcache:',
  USER_SOCKET_MAP: 'usersocket:',
};

module.exports = {
  MessageStatus,
  ChatType,
  SocketEvents,
  KafkaTopics,
  RedisKeys,
};
