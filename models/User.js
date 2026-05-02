const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    preferredMfaChannel: {
      type: String,
      enum: ['email', 'totp'],
      default: 'email',
    },
    mfaSecret: {
      type: String,
      default: null, // TOTP secret (base32)
    },
    isMfaEnabled: {
      type: Boolean,
      default: true,
    },
    isTotpVerified: {
      type: Boolean,
      default: false, // True after user scans QR and submits a valid TOTP
    },
    isVerified: {
      type: Boolean,
      default: false, // True for email‑MFA users; TOTP users become verified after scanning QR
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster email lookups
userSchema.index({ email: 1 });

// Virtual for public profile (sent to frontend)
userSchema.virtual('profile').get(function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    preferredMfaChannel: this.preferredMfaChannel,
    isMfaEnabled: this.isMfaEnabled,
    isTotpVerified: this.isTotpVerified,
    isVerified: this.isVerified,
    createdAt: this.createdAt,
  };
});

// Prevent passwordHash from being sent in JSON responses
userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.mfaSecret;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;