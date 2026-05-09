const { Kafka } = require('kafkajs');
const { KafkaTopics } = require('@chat/types');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const config = require('../utils/config');

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

const consumer = kafka.consumer({
  groupId: config.kafka.groupId,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

// Dead letter queue producer for failed messages
const dlqProducer = kafka.producer();

async function startConsumer() {
  await consumer.connect();
  await dlqProducer.connect();

  await consumer.subscribe({
    topics: [KafkaTopics.MESSAGES],
    fromBeginning: false,
  });

  await consumer.run({
    // Process messages one at a time per partition for ordering
    partitionsConsumedConcurrently: 4,

    eachMessage: async ({ topic, partition, message }) => {
      const startTime = Date.now();

      try {
        const event = JSON.parse(message.value.toString());

        switch (event.type) {
          case 'new_message':
            await handleNewMessage(event.payload);
            break;
          case 'message_edit':
            await handleMessageEdit(event.payload);
            break;
          case 'message_delete':
            await handleMessageDelete(event.payload);
            break;
          default:
            console.warn(`[consumer] Unknown event type: ${event.type}`);
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > 100) {
          console.warn(`[consumer] Slow processing: ${elapsed}ms for ${event.type}`);
        }
      } catch (err) {
        console.error(`[consumer] Error processing message:`, err.message);
        await sendToDeadLetterQueue(topic, message, err);
      }
    },
  });

  console.log('[consumer] Message consumer started');
}

async function handleNewMessage(payload) {
  const { id, chatId, senderId, senderUsername, content, type, replyTo, media, createdAt } = payload;

  // Persist message to MongoDB
  const msg = new Message({
    messageId: id,
    chatId,
    senderId,
    senderUsername,
    content,
    type,
    replyTo,
    media,
    status: 'sent',
    createdAt: new Date(createdAt),
  });

  await msg.save();

  // Update chat's last message (atomic)
  await Chat.findOneAndUpdate(
    { chatId },
    {
      $set: {
        lastMessage: {
          messageId: id,
          content: type === 'text' ? content.slice(0, 100) : `[${type}]`,
          senderId,
          senderUsername,
          timestamp: new Date(createdAt),
        },
      },
    },
    { upsert: false }
  );
}

async function handleMessageEdit(payload) {
  const { messageId, content, senderId } = payload;

  await Message.updateOne(
    { messageId, senderId }, // Only sender can edit
    {
      $set: {
        content,
        edited: true,
        editedAt: new Date(),
      },
    }
  );
}

async function handleMessageDelete(payload) {
  const { messageId, senderId } = payload;

  await Message.updateOne(
    { messageId, senderId },
    { $set: { deleted: true, content: '' } }
  );
}

async function sendToDeadLetterQueue(originalTopic, message, error) {
  try {
    await dlqProducer.send({
      topic: KafkaTopics.MESSAGES_DLQ,
      messages: [{
        key: message.key,
        value: message.value,
        headers: {
          'x-original-topic': originalTopic,
          'x-error-message': error.message,
          'x-failed-at': String(Date.now()),
          'x-retry-count': String(
            parseInt(message.headers?.['x-retry-count']?.toString() || '0', 10) + 1
          ),
        },
      }],
    });
    console.warn(`[consumer] Message sent to DLQ: ${error.message}`);
  } catch (dlqErr) {
    console.error(`[consumer] Failed to send to DLQ:`, dlqErr.message);
  }
}

async function stopConsumer() {
  await consumer.disconnect();
  await dlqProducer.disconnect();
}

module.exports = { startConsumer, stopConsumer };
