const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  channel: {
    type: String,
    enum: ['email', 'totp', 'passkey'],
  },
  ipAddress: {
    type: String,
    default: 'unknown',
  },
  at: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Auto-delete events older than 30 days
loginEventSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const LoginEvent = mongoose.model('LoginEvent', loginEventSchema);

module.exports = LoginEvent;
