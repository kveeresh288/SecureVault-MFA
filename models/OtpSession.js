const mongoose = require('mongoose');

const otpSessionSchema = new mongoose.Schema(
  {
    // Random hex token sent to client after password verification
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // User who requested the OTP
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // 6‑digit OTP (hashed before storage)
    otpHash: {
      type: String,
      required: true,
    },
    // Channel used to deliver the OTP
    channel: {
      type: String,
      enum: ['email', 'totp', 'reset'],
      required: true,
    },
    // When the OTP expires (5 minutes for email, 30 seconds for TOTP)
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    // Number of verification attempts made
    attempts: {
      type: Number,
      default: 0,
    },
    // Whether this session has been successfully verified
    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index automatically deletes expired documents
otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OtpSession = mongoose.model('OtpSession', otpSessionSchema);

module.exports = OtpSession;