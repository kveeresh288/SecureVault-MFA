const mongoose = require('mongoose');

const passkeySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: 'My Passkey',
    },
    credentialID: {
      type: String,   // base64url-encoded
      required: true,
      unique: true,
      index: true,
    },
    credentialPublicKey: {
      type: String,   // base64url-encoded Uint8Array
      required: true,
    },
    counter: {
      type: Number,
      default: 0,
    },
    transports: {
      type: [String],
      default: [],
    },
    deviceType: {
      type: String,   // 'singleDevice' | 'multiDevice'
      default: 'singleDevice',
    },
    backedUp: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Passkey = mongoose.model('Passkey', passkeySchema);

module.exports = Passkey;
