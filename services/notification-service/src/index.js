const express = require('express');
const { Kafka } = require('kafkajs');
const Redis = require('ioredis');
const webpush = require('web-push');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3004,
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    groupId: 'notification-service-group',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  vapid: {
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@chatapp.com',
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
  },
};

// Web Push setup
if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const redis = new Redis(config.redis);

// ── Push Subscription Management ──

// Store push subscription for a user
app.post('/api/notifications/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'userId and subscription required' });
  }

  await redis.hset('push:subscriptions', userId, JSON.stringify(subscription));
  res.json({ success: true });
});

// Unsubscribe
app.post('/api/notifications/unsubscribe', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  await redis.hdel('push:subscriptions', userId);
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service', timestamp: Date.now() });
});

// ── Kafka Consumer ──

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: config.kafka.brokers,
});

const consumer = kafka.consumer({ groupId: config.kafka.groupId });

async function sendPushNotification(userId, payload) {
  try {
    const subJson = await redis.hget('push:subscriptions', userId);
    if (!subJson) return; // User has no push subscription

    const subscription = JSON.parse(subJson);

    // Check if user is currently online — skip push if they are
    const presence = await redis.get(`presence:${userId}`);
    if (presence === 'online') return;

    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410) {
      // Subscription expired — clean up
      await redis.hdel('push:subscriptions', userId);
    } else {
      console.error(`[notification] Push failed for ${userId}:`, err.message);
    }
  }
}

async function startNotificationConsumer() {
  await consumer.connect();

  await consumer.subscribe({
    topics: ['chat.notifications'],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const { type, payload } = event;

        switch (type) {
          case 'new_message': {
            // Send push to all participants except sender
            const { chatId, senderId, senderUsername, content, participants } = payload;

            const notificationPayload = {
              title: senderUsername,
              body: content.slice(0, 200),
              data: { chatId, messageId: payload.id },
              tag: `chat:${chatId}`, // Collapse notifications per chat
            };

            for (const participantId of participants || []) {
              if (participantId !== senderId) {
                await sendPushNotification(participantId, notificationPayload);
              }
            }
            break;
          }

          case 'mention': {
            const { userId, chatId, senderUsername, content } = payload;
            await sendPushNotification(userId, {
              title: `${senderUsername} mentioned you`,
              body: content.slice(0, 200),
              data: { chatId },
            });
            break;
          }
        }
      } catch (err) {
        console.error('[notification] Consumer error:', err.message);
      }
    },
  });

  console.log('[notification-service] Kafka consumer started');
}

async function start() {
  try {
    await startNotificationConsumer();

    app.listen(config.port, () => {
      console.log(`[notification-service] Running on port ${config.port}`);
    });
  } catch (err) {
    console.error('[notification-service] Failed to start:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await consumer.disconnect();
  redis.disconnect();
  process.exit(0);
});

start();

module.exports = app;
