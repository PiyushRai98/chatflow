const Redis = require('ioredis');
const config = require('./config');
const { RedisKeys } = require('@chat/types');

let pubClient = null;
let subClient = null;
let dataClient = null;

function createClient(name) {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy(times) {
      return Math.min(times * 100, 3000);
    },
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => console.log(`[redis:${name}] Connected`));
  client.on('error', (err) => console.error(`[redis:${name}] Error:`, err.message));

  return client;
}

function getPubClient() {
  if (!pubClient) pubClient = createClient('pub');
  return pubClient;
}

function getSubClient() {
  if (!subClient) subClient = createClient('sub');
  return subClient;
}

function getDataClient() {
  if (!dataClient) dataClient = createClient('data');
  return dataClient;
}

// Presence management
async function setUserOnline(userId, socketId, serverId) {
  const redis = getDataClient();
  const pipeline = redis.pipeline();

  // Map user → socket:server for cross-server routing
  pipeline.hset(`${RedisKeys.USER_SOCKET_MAP}${userId}`, 'socketId', socketId, 'serverId', serverId);
  pipeline.set(`${RedisKeys.USER_PRESENCE}${userId}`, 'online');
  pipeline.expire(`${RedisKeys.USER_SOCKET_MAP}${userId}`, 86400);
  pipeline.expire(`${RedisKeys.USER_PRESENCE}${userId}`, 86400);

  await pipeline.exec();
}

async function setUserOffline(userId) {
  const redis = getDataClient();
  const pipeline = redis.pipeline();

  pipeline.del(`${RedisKeys.USER_SOCKET_MAP}${userId}`);
  pipeline.set(`${RedisKeys.USER_PRESENCE}${userId}`, 'offline');
  pipeline.expire(`${RedisKeys.USER_PRESENCE}${userId}`, 86400);

  await pipeline.exec();
}

async function getUserPresence(userId) {
  const redis = getDataClient();
  return await redis.get(`${RedisKeys.USER_PRESENCE}${userId}`) || 'offline';
}

async function getUserSocketInfo(userId) {
  const redis = getDataClient();
  return await redis.hgetall(`${RedisKeys.USER_SOCKET_MAP}${userId}`);
}

// Typing indicators
async function setTyping(chatId, userId, displayName) {
  const redis = getDataClient();
  await redis.hset(`${RedisKeys.CHAT_TYPING}${chatId}`, userId, displayName);
  await redis.expire(`${RedisKeys.CHAT_TYPING}${chatId}`, 10); // Auto-expire
}

async function clearTyping(chatId, userId) {
  const redis = getDataClient();
  await redis.hdel(`${RedisKeys.CHAT_TYPING}${chatId}`, userId);
}

async function getTypingUsers(chatId) {
  const redis = getDataClient();
  return await redis.hgetall(`${RedisKeys.CHAT_TYPING}${chatId}`);
}

module.exports = {
  getPubClient,
  getSubClient,
  getDataClient,
  setUserOnline,
  setUserOffline,
  getUserPresence,
  getUserSocketInfo,
  setTyping,
  clearTyping,
  getTypingUsers,
};
