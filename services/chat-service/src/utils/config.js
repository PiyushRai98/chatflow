require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3002,
  nodeEnv: process.env.NODE_ENV || 'development',
  serviceName: 'chat-service',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'chat-service',
  },

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_messages',
  },

  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000'],
};
