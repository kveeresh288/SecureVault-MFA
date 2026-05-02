const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

const User = require('../models/User');
const OtpSession = require('../models/OtpSession');
const LoginEvent = require('../models/LoginEvent');
const { sendOtpEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { generateTotpSecret, generateQrCode, verifyTotpToken } = require('../utils/totpService');
const { sendSimulatedOtp, verifySimulatedOtp, getOtpDetails } = require('../utils/offlineOtpService');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a cryptographically random 6-digit OTP */
const generateOtp = () => {
  return String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');
};

/** Issue JWT and set it in an HttpOnly cookie */
const issueJwtCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  const cookieOptions = {
    httpOnly: true,                         // JS cannot read this cookie
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,       // 7 days in ms
  };

  res.cookie('jwt', token, cookieOptions);
  return token;
};

// ─── REGISTER ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Creates a new user. If TOTP is selected, returns a QR code for setup.
 */
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password, preferredMfaChannel } = req.body;

  try {
    // Check duplicate email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password (12 salt rounds = strong but not too slow)
    const passwordHash = await bcrypt.hash(password, 12);

    let mfaSecret = null;
    let qrCode = null;

    // Generate TOTP secret if user prefers Authenticator App
    if (preferredMfaChannel === 'totp') {
      mfaSecret = generateTotpSecret();
      qrCode = await generateQrCode(email, mfaSecret);
    }

    const user = await User.create({
      name,
      email,
      passwordHash,
      preferredMfaChannel: preferredMfaChannel || 'email',
      mfaSecret,
      isMfaEnabled: true,
      isTotpVerified: false,
      isVerified: preferredMfaChannel !== 'totp', // TOTP users must verify QR first
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        preferredMfaChannel: user.preferredMfaChannel,
        // Only sent on TOTP registration — user must scan this QR
        qrCode: qrCode || null,
        mfaSecret: preferredMfaChannel === 'totp' ? mfaSecret : null,
      },
    });
  } catch (err) {
    console.error('[Register Error]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── LOGIN (Step 1) ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Validates credentials. On success, triggers MFA and returns a sessionToken.
 * Frontend must POST this sessionToken + OTP to /verify-mfa to complete login.
 */
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Explicitly select passwordHash (hidden by default in schema)
    const user = await User.findOne({ email }).select('+passwordHash +mfaSecret');

    // Use consistent error message to prevent user enumeration attacks
    const invalidMsg = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({ success: false, message: invalidMsg });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: invalidMsg });
    }

    // Generate a secure random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    let otpCode = null;

    if (user.preferredMfaChannel === 'email') {
      // Generate OTP and hash it before storing
      otpCode = generateOtp();
      const otpHash = await bcrypt.hash(otpCode, 10);

      await OtpSession.create({
        userId: user._id,
        otpHash,
        sessionToken,
        channel: 'email',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      });

      if (process.env.USE_REAL_EMAIL === 'true') {
        await sendOtpEmail(user.email, otpCode, user.name);
      } else {
        // Simulated mode: logs OTP to console and returns it in the response
        await sendSimulatedOtp(user.email, otpCode, user.name, sessionToken);
      }
    } else if (user.preferredMfaChannel === 'totp') {
      // For TOTP, no OTP to send — user reads it from their authenticator app
      // Still create a session to validate the sessionToken on verify
      await OtpSession.create({
        userId: user._id,
        otpHash: 'totp', // placeholder — actual verification uses TOTP library
        sessionToken,
        channel: 'totp',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      });
    }

    // In simulated mode, include OTP in response so the dev UI can display it
    const useRealEmail = process.env.USE_REAL_EMAIL === 'true';
    let otpDetails = null;
    if (user.preferredMfaChannel === 'email' && !useRealEmail) {
      otpDetails = getOtpDetails(sessionToken);
    }

    return res.status(200).json({
      success: true,
      message:
        user.preferredMfaChannel === 'email'
          ? (useRealEmail ? 'OTP sent to your email.' : 'OTP generated. Check console for OTP.')
          : 'Enter the code from your Authenticator app.',
      data: {
        sessionToken,
        mfaChannel: user.preferredMfaChannel,
        availableMethods: user.isTotpVerified ? ['email', 'totp'] : ['email'],
        // Mask email for display: a***@gmail.com
        emailHint:
          user.preferredMfaChannel === 'email'
            ? user.email.replace(/^(.)(.+)(@.+)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
            : null,
        // Include OTP in development mode for testing
        ...(otpDetails && { otp: otpDetails.otp, expiresIn: otpDetails.expiresIn }),
      },
    });
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── VERIFY MFA (Step 2) ─────────────────────────────────────────────────────

/**
 * POST /api/auth/verify-mfa
 * Validates the OTP/TOTP. On success, issues JWT cookie.
 */
const verifyMfa = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { sessionToken, otp } = req.body;

  try {
    const session = await OtpSession.findOne({ sessionToken });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session. Please log in again.',
      });
    }

    // Check if session expired (should be handled by TTL, this is a belt-and-suspenders check)
    if (session.expiresAt < new Date()) {
      await session.deleteOne();
      return res.status(401).json({
        success: false,
        message: 'OTP has expired. Please log in again.',
      });
    }

    // Check if already used (prevent replay attacks)
    if (session.verified) {
      return res.status(401).json({
        success: false,
        message: 'This OTP has already been used.',
      });
    }

    // Max 3 attempts (as per requirements)
    if (session.attempts >= 3) {
      await session.deleteOne();
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts (max 3). Please log in again.',
      });
    }

    let isValid = false;

    if (session.channel === 'totp') {
      // Get user's TOTP secret
      const user = await User.findById(session.userId).select('+mfaSecret');
      if (!user || !user.mfaSecret) {
        return res.status(401).json({ success: false, message: 'TOTP not configured.' });
      }
      isValid = verifyTotpToken(otp, user.mfaSecret);
    } else {
      // Email OTP: check both database and offline store
      // First try database (bcrypt comparison)
      isValid = await bcrypt.compare(otp, session.otpHash);
      
      // If database check fails, try offline store (for development)
      if (!isValid && process.env.NODE_ENV !== 'production') {
        const offlineResult = verifySimulatedOtp(sessionToken, otp);
        isValid = offlineResult.valid;
        
        // If offline verification succeeded, we still need to mark database session as used
        if (isValid) {
          session.verified = true;
          await session.save();
        }
      }
    }

    if (!isValid) {
      // Increment attempt count
      session.attempts += 1;
      await session.save();
      return res.status(401).json({
        success: false,
        message: `Invalid code. ${3 - session.attempts} attempts remaining.`,
        attemptsLeft: 3 - session.attempts,
      });
    }

    // OTP is valid — mark session as used (prevents replay)
    session.verified = true;
    await session.save();

    // Record login event for history
    await LoginEvent.create({
      userId: session.userId,
      channel: session.channel,
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    });

    // Update last login
    await User.findByIdAndUpdate(session.userId, { lastLoginAt: new Date(), isVerified: true });

    // Issue JWT
    issueJwtCookie(res, session.userId);

    // Get user data for response
    const user = await User.findById(session.userId);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          preferredMfaChannel: user.preferredMfaChannel,
        },
      },
    });
  } catch (err) {
    console.error('[VerifyMFA Error]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── VERIFY TOTP SETUP ───────────────────────────────────────────────────────

/**
 * POST /api/auth/verify-totp-setup
 * Called after registration when user scans QR code.
 * Confirms the TOTP secret is working before marking it active.
 */
const verifyTotpSetup = async (req, res) => {
  const { userId, totpToken } = req.body;

  try {
    const user = await User.findById(userId).select('+mfaSecret');
    if (!user || !user.mfaSecret) {
      return res.status(400).json({ success: false, message: 'User or TOTP secret not found.' });
    }

    const isValid = verifyTotpToken(totpToken, user.mfaSecret);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid code. Please scan the QR again and retry.',
      });
    }

    await User.findByIdAndUpdate(userId, { isTotpVerified: true, isVerified: true });

    return res.status(200).json({
      success: true,
      message: 'Authenticator app verified and linked successfully.',
    });
  } catch (err) {
    console.error('[TOTP Setup Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET DASHBOARD ───────────────────────────────────────────────────────────

/**
 * GET /api/auth/dashboard
 * Protected route. Returns the authenticated user's profile.
 */
const dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          preferredMfaChannel: user.preferredMfaChannel,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          isVerified: user.isVerified,
          isTotpVerified: user.isTotpVerified,
        },
      },
    });
  } catch (err) {
    console.error('[Dashboard Error]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

/**
 * GET /api/auth/health
 * Public endpoint for monitoring/status checks.
 */
const health = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Auth API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
};

// ─── RESEND OTP ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/resend-otp
 * Resends OTP for an existing session (development mode only for email channel)
 */
const resendOtp = async (req, res) => {
  const { sessionToken, email, channel } = req.body;

  if (!sessionToken || !email || !channel) {
    return res.status(400).json({
      success: false,
      message: 'Session token, email, and channel are required',
    });
  }

  try {
    // Find the existing OTP session
    const otpSession = await OtpSession.findOne({
      sessionToken,
      userId: { $exists: true },
      verified: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpSession) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or expired',
      });
    }

    // Check if channel matches
    if (otpSession.channel !== channel) {
      return res.status(400).json({
        success: false,
        message: 'Channel mismatch',
      });
    }

    // Get user details
    const user = await User.findById(otpSession.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Generate new OTP
    const newOtp = generateOtp();
    const otpHash = await bcrypt.hash(newOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Update the OTP session
    otpSession.otpHash = otpHash;
    otpSession.expiresAt = expiresAt;
    otpSession.attempts = 0; // Reset attempts
    await otpSession.save();

    // Prepare response data
    const responseData = {
      sessionToken: otpSession.sessionToken,
      channel: otpSession.channel,
      expiresIn: 300, // 5 minutes in seconds
    };

    // Handle based on channel and environment
    if (channel === 'email') {
      if (process.env.USE_REAL_EMAIL === 'true') {
        await sendOtpEmail(email, newOtp, user.name);
        return res.status(200).json({
          success: true,
          message: 'OTP resent via email',
          data: responseData,
        });
      } else {
        const offlineResult = await sendSimulatedOtp(email, newOtp, user.name);
        responseData.otp = newOtp;
        responseData.emailHint = offlineResult.emailHint;
        return res.status(200).json({
          success: true,
          message: 'OTP resent (dev mode)',
          data: responseData,
        });
      }
    } else if (channel === 'totp') {
      // For TOTP, just confirm resend (TOTP doesn't need resending)
      return res.status(200).json({
        success: true,
        message: 'TOTP verification ready',
        data: responseData,
      });
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// ─── LOGOUT ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 * Clears the JWT cookie.
 */
const logout = async (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
};

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

  try {
    const user = await User.findOne({ email });
    // Always return same message to prevent user enumeration
    const okMsg = 'If that email is registered, a reset code was sent.';

    if (!user) return res.status(200).json({ success: true, message: okMsg });

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Remove any existing reset sessions for this user
    await OtpSession.deleteMany({ userId: user._id, channel: 'reset' });

    await OtpSession.create({
      userId: user._id,
      otpHash,
      sessionToken,
      channel: 'reset',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    if (process.env.USE_REAL_EMAIL === 'true') {
      await sendPasswordResetEmail(user.email, otp, user.name);
    } else {
      console.log(`🔑 [RESET OTP] ${otp} for ${user.email} | session: ${sessionToken}`);
    }

    return res.status(200).json({
      success: true,
      message: okMsg,
      data: {
        sessionToken,
        emailHint: user.email.replace(/^(.)(.+)(@.+)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c),
        ...(process.env.USE_REAL_EMAIL !== 'true' && { otp }),
      },
    });
  } catch (err) {
    console.error('[ForgotPassword Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

const resetPassword = async (req, res) => {
  const { sessionToken, otp, newPassword } = req.body;
  if (!sessionToken || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  try {
    const session = await OtpSession.findOne({ sessionToken, channel: 'reset' });

    if (!session || session.verified || session.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset session. Please try again.' });
    }
    if (session.attempts >= 3) {
      await session.deleteOne();
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new reset code.' });
    }

    const isValid = await bcrypt.compare(otp, session.otpHash);
    if (!isValid) {
      session.attempts += 1;
      await session.save();
      return res.status(401).json({
        success: false,
        message: `Invalid code. ${3 - session.attempts} attempt(s) remaining.`,
      });
    }

    session.verified = true;
    await session.save();

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(session.userId, { passwordHash });

    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('[ResetPassword Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── SWITCH MFA CHANNEL ───────────────────────────────────────────────────────

const switchMfaChannel = async (req, res) => {
  const { sessionToken, newChannel } = req.body;
  if (!sessionToken || !['email', 'totp'].includes(newChannel)) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }

  try {
    const oldSession = await OtpSession.findOne({ sessionToken });
    if (!oldSession || oldSession.verified || oldSession.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    if (oldSession.channel === newChannel) {
      return res.status(400).json({ success: false, message: 'Already using that method.' });
    }

    const user = await User.findById(oldSession.userId).select('+mfaSecret');
    if (newChannel === 'totp' && !user.isTotpVerified) {
      return res.status(400).json({ success: false, message: 'Authenticator app is not set up for this account.' });
    }

    await oldSession.deleteOne();

    const newSessionToken = crypto.randomBytes(32).toString('hex');
    let otpCode = null;

    if (newChannel === 'email') {
      otpCode = generateOtp();
      const otpHash = await bcrypt.hash(otpCode, 10);
      await OtpSession.create({
        userId: user._id,
        otpHash,
        sessionToken: newSessionToken,
        channel: 'email',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      if (process.env.USE_REAL_EMAIL === 'true') {
        await sendOtpEmail(user.email, otpCode, user.name);
      } else {
        await sendSimulatedOtp(user.email, otpCode, user.name, newSessionToken);
      }
    } else {
      await OtpSession.create({
        userId: user._id,
        otpHash: 'totp',
        sessionToken: newSessionToken,
        channel: 'totp',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    }

    const useRealEmail = process.env.USE_REAL_EMAIL === 'true';
    let otpDetails = null;
    if (newChannel === 'email' && !useRealEmail) {
      otpDetails = getOtpDetails(newSessionToken);
    }

    return res.status(200).json({
      success: true,
      message: newChannel === 'email'
        ? (useRealEmail ? 'OTP sent to your email.' : 'OTP generated.')
        : 'Enter the code from your Authenticator app.',
      data: {
        sessionToken: newSessionToken,
        mfaChannel: newChannel,
        emailHint: newChannel === 'email'
          ? user.email.replace(/^(.)(.+)(@.+)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
          : null,
        ...(otpDetails && { otp: otpDetails.otp, expiresIn: otpDetails.expiresIn }),
      },
    });
  } catch (err) {
    console.error('[SwitchMFAChannel Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET LOGIN HISTORY ───────────────────────────────────────────────────────

const getLoginHistory = async (req, res) => {
  try {
    const events = await LoginEvent.find({ userId: req.userId })
      .sort({ at: -1 })
      .limit(20);
    return res.status(200).json({ success: true, data: { events } });
  } catch (err) {
    console.error('[LoginHistory Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── UPDATE PROFILE ──────────────────────────────────────────────────────────

const updateProfile = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Name is required.' });
  }
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { name: name.trim() },
      { new: true }
    );
    return res.status(200).json({
      success: true,
      message: 'Profile updated.',
      data: { user: { id: user._id, name: user.name, email: user.email } },
    });
  } catch (err) {
    console.error('[UpdateProfile Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Both passwords are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
  }
  try {
    const user = await User.findById(req.userId).select('+passwordHash');
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(req.userId, { passwordHash });
    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[ChangePassword Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── CHANGE MFA METHOD ────────────────────────────────────────────────────────

const changeMfaMethod = async (req, res) => {
  const { newChannel, password } = req.body;
  if (!newChannel || !['email', 'totp'].includes(newChannel)) {
    return res.status(400).json({ success: false, message: 'Channel must be "email" or "totp".' });
  }
  if (!password) {
    return res.status(400).json({ success: false, message: 'Password is required to change MFA method.' });
  }
  try {
    const user = await User.findById(req.userId).select('+passwordHash +mfaSecret');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }
    if (user.preferredMfaChannel === newChannel) {
      return res.status(400).json({ success: false, message: `Already using ${newChannel} MFA.` });
    }

    let qrCode = null;
    let mfaSecret = null;

    if (newChannel === 'totp') {
      mfaSecret = generateTotpSecret();
      qrCode = await generateQrCode(user.email, mfaSecret);
      await User.findByIdAndUpdate(req.userId, {
        preferredMfaChannel: 'totp',
        mfaSecret,
        isTotpVerified: false,
      });
    } else {
      await User.findByIdAndUpdate(req.userId, {
        preferredMfaChannel: 'email',
        mfaSecret: null,
        isTotpVerified: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: newChannel === 'totp'
        ? 'Scan the QR code with your authenticator app to complete setup.'
        : 'MFA method changed to email OTP.',
      data: { qrCode, mfaSecret: newChannel === 'totp' ? mfaSecret : null, userId: req.userId },
    });
  } catch (err) {
    console.error('[ChangeMFA Error]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  register, login, verifyMfa, verifyTotpSetup, dashboard, logout, health, resendOtp,
  getLoginHistory, updateProfile, changePassword, changeMfaMethod,
  forgotPassword, resetPassword, switchMfaChannel,
};
