const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  chatId: {
    type: String,
    required: true,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
    index: true,
  },
  senderUsername: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video', 'system'],
    default: 'text',
  },
  media: {
    url: String,
    thumbnail: String,
    mimeType: String,
    size: Number, // bytes
    fileName: String,
  },
  replyTo: {
    type: String, // messageId of parent
    default: null,
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent',
  },
  deliveredTo: [{
    userId: String,
    timestamp: Date,
  }],
  readBy: [{
    userId: String,
    timestamp: Date,
  }],
  edited: {
    type: Boolean,
    default: false,
  },
  editedAt: Date,
  deleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Compound index for chat message pagination (most common query)
messageSchema.index({ chatId: 1, createdAt: -1 });

// For unread message count queries
messageSchema.index({ chatId: 1, status: 1 });

// TTL index — auto-delete messages older than 1 year (configurable)
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
