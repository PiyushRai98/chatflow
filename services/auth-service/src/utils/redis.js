const Redis = require('ioredis');
const config = require('./config');

let client = null;

function createRedisClient() {
  if (client) return client;

  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  return client;
}

function getRedisClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return client;
}

module.exports = { createRedisClient, getRedisClient };
