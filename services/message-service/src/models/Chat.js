const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true,
  },
  name: {
    type: String, // Only for group chats
    maxlength: 100,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  avatarUrl: String,
  participants: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
    displayName: String,
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    joinedAt: { type: Date, default: Date.now },
    lastReadMessageId: String,
    lastReadAt: Date,
    muted: { type: Boolean, default: false },
  }],
  lastMessage: {
    messageId: String,
    content: String,
    senderId: String,
    senderUsername: String,
    timestamp: Date,
  },
  createdBy: {
    type: String,
    required: true,
  },
  pinnedMessages: [String], // messageIds
}, {
  timestamps: true,
});

// Index for finding chats by participant
chatSchema.index({ 'participants.userId': 1 });

// Index for listing chats sorted by last activity
chatSchema.index({ 'lastMessage.timestamp': -1 });

// For direct chats, ensure uniqueness between two users
chatSchema.index(
  { type: 1, 'participants.userId': 1 },
  { unique: false }
);

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
