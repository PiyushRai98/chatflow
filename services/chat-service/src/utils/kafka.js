const { Kafka, Partitioners } = require('kafkajs');
const config = require('./config');
const { KafkaTopics } = require('@chat/types');

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
});

let connected = false;

async function connectProducer() {
  if (connected) return;
  await producer.connect();
  connected = true;
  console.log('[kafka] Producer connected');
}

async function publishMessage(topic, key, value) {
  if (!connected) await connectProducer();

  await producer.send({
    topic,
    messages: [
      {
        key, // Partition by chat_id for ordering guarantee
        value: JSON.stringify(value),
        timestamp: String(Date.now()),
      },
    ],
  });
}

async function publishChatMessage(message) {
  await publishMessage(KafkaTopics.MESSAGES, message.chatId, {
    type: 'new_message',
    payload: message,
    timestamp: Date.now(),
  });
}

async function publishNotification(notification) {
  await publishMessage(KafkaTopics.NOTIFICATIONS, notification.userId, {
    type: 'notification',
    payload: notification,
    timestamp: Date.now(),
  });
}

async function disconnectProducer() {
  if (connected) {
    await producer.disconnect();
    connected = false;
  }
}

module.exports = {
  kafka,
  producer,
  connectProducer,
  publishMessage,
  publishChatMessage,
  publishNotification,
  disconnectProducer,
};
