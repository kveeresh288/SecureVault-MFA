const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Passkey = require('../models/Passkey');
const LoginEvent = require('../models/LoginEvent');

// In-memory challenge store  { storeKey → { challenge, userId?, expiresAt } }
const challengeStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of challengeStore) {
    if (v.expiresAt < now) challengeStore.delete(k);
  }
}, 60_000);

const RP_ID   = process.env.RP_ID   || 'localhost';
const RP_NAME = process.env.RP_NAME || 'SecureVault';
const ORIGIN  = process.env.RP_ORIGIN || 'http://localhost:5173';

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

/**
 * GET /api/auth/passkey/register-options  (authenticated)
 * Returns WebAuthn registration options for the logged-in user.
 */
const passkeyRegisterOptions = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const existing = await Passkey.find({ userId: req.userId }).select('credentialID transports');

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email,
      userID: Buffer.from(user._id.toString()),
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: existing.map(pk => ({
        id: pk.credentialID,
        type: 'public-key',
        transports: pk.transports,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challengeStore.set(req.userId.toString(), {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return res.status(200).json({ success: true, data: options });
  } catch (err) {
    console.error('[PasskeyRegisterOptions]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/auth/passkey/register-verify  (authenticated)
 * Verifies the credential from the browser and stores the passkey.
 */
const passkeyRegisterVerify = async (req, res) => {
  const { credential, name } = req.body;
  const uid = req.userId.toString();

  try {
    const stored = challengeStore.get(uid);
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(401).json({ success: false, message: 'Challenge expired. Try again.' });
    }

    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    challengeStore.delete(uid);

    if (!verified || !registrationInfo) {
      return res.status(400).json({ success: false, message: 'Passkey verification failed.' });
    }

    // v13: credentialID/publicKey/counter are nested under registrationInfo.credential
    const { credential: regCred, credentialDeviceType, credentialBackedUp } = registrationInfo;

    await Passkey.create({
      userId: req.userId,
      name: (name || 'My Passkey').slice(0, 50),
      credentialID: regCred.id,                              // already base64url in v13
      credentialPublicKey: isoBase64URL.fromBuffer(regCred.publicKey), // Uint8Array → base64url
      counter: regCred.counter,
      transports: credential.response?.transports || regCred.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });

    return res.status(201).json({ success: true, message: 'Passkey registered successfully.' });
  } catch (err) {
    console.error('[PasskeyRegisterVerify]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── AUTHENTICATION ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/passkey/auth-options  (public)
 * Returns WebAuthn authentication options. Optionally scoped to a user by email.
 */
const passkeyAuthOptions = async (req, res) => {
  const { email } = req.body;

  try {
    let allowCredentials = [];
    let userId = null;

    if (email) {
      const user = await User.findOne({ email });
      if (user) {
        const passkeys = await Passkey.find({ userId: user._id }).select('credentialID transports');
        allowCredentials = passkeys.map(pk => ({
          id: pk.credentialID,
          type: 'public-key',
          transports: pk.transports,
        }));
        userId = user._id.toString();
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Use userId as key if known, otherwise use a prefix of the challenge
    const storeKey = userId || `pk_${options.challenge.slice(0, 12)}`;
    challengeStore.set(storeKey, {
      challenge: options.challenge,
      userId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return res.status(200).json({ success: true, data: { ...options, storeKey } });
  } catch (err) {
    console.error('[PasskeyAuthOptions]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/auth/passkey/auth-verify  (public)
 * Verifies the authentication assertion and issues a JWT cookie.
 */
const passkeyAuthVerify = async (req, res) => {
  const { credential, storeKey } = req.body;

  try {
    const stored = challengeStore.get(storeKey);
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(401).json({ success: false, message: 'Challenge expired. Please try again.' });
    }

    const passkey = await Passkey.findOne({ credentialID: credential.id });
    if (!passkey) {
      return res.status(404).json({ success: false, message: 'Passkey not recognised on this account.' });
    }

    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.credentialID,
        publicKey: isoBase64URL.toBuffer(passkey.credentialPublicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    challengeStore.delete(storeKey);

    if (!verified) {
      return res.status(401).json({ success: false, message: 'Passkey authentication failed.' });
    }

    // Update replay-attack counter
    await Passkey.findByIdAndUpdate(passkey._id, { counter: authenticationInfo.newCounter });

    // Record login event
    await LoginEvent.create({
      userId: passkey.userId,
      channel: 'passkey',
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    });

    await User.findByIdAndUpdate(passkey.userId, { lastLoginAt: new Date() });

    // Issue JWT cookie (same settings as regular login)
    const token = jwt.sign({ id: passkey.userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const user = await User.findById(passkey.userId);
    return res.status(200).json({
      success: true,
      message: 'Signed in with passkey.',
      data: { user: { id: user._id, name: user.name, email: user.email, preferredMfaChannel: user.preferredMfaChannel } },
    });
  } catch (err) {
    console.error('[PasskeyAuthVerify]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── MANAGEMENT ───────────────────────────────────────────────────────────────

const listPasskeys = async (req, res) => {
  try {
    const passkeys = await Passkey.find({ userId: req.userId })
      .select('name deviceType backedUp createdAt')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { passkeys } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const deletePasskey = async (req, res) => {
  try {
    const passkey = await Passkey.findOne({ _id: req.params.id, userId: req.userId });
    if (!passkey) return res.status(404).json({ success: false, message: 'Passkey not found.' });
    await passkey.deleteOne();
    return res.status(200).json({ success: true, message: 'Passkey removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyAuthOptions,
  passkeyAuthVerify,
  listPasskeys,
  deletePasskey,
};
