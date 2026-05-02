const crypto = require('crypto');

/**
 * Offline OTP Service for development/testing
 * Simulates OTP delivery without external services
 */

// In-memory store for OTPs (for development only)
// In production, this would be replaced with real email/SMS service
const otpStore = new Map(); // sessionToken -> { otp, email, expiresAt }

/**
 * Generate a cryptographically random 6-digit OTP
 */
const generateOtp = () => {
  return String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');
};

/**
 * Simulate sending OTP - stores it in memory and logs to console
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit OTP
 * @param {string} userName - User's name for personalization
 * @param {string} sessionToken - Session token for OTP verification
 * @returns {Promise<Object>} Simulated result
 */
const sendSimulatedOtp = async (to, otp, userName = 'User', sessionToken) => {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  
  // Store OTP in memory for verification
  otpStore.set(sessionToken, {
    otp,
    email: to,
    expiresAt,
    attempts: 0,
    maxAttempts: 3
  });
  
  // Clean up expired OTPs
  cleanupExpiredOtps();
  
  // Log OTP to console for development
  console.log('📱 [OFFLINE OTP SERVICE]');
  console.log('══════════════════════════════════════════════════');
  console.log(`To: ${to}`);
  console.log(`User: ${userName}`);
  console.log(`OTP: ${otp}`);
  console.log(`Expires: ${expiresAt.toLocaleTimeString()}`);
  console.log(`Session Token: ${sessionToken}`);
  console.log('══════════════════════════════════════════════════');
  console.log('Note: In production, this would be sent via email/SMS');
  console.log('');
  
  return {
    success: true,
    message: 'OTP generated successfully (offline mode)',
    otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    sessionToken,
    expiresAt
  };
};

/**
 * Verify OTP against stored value
 * @param {string} sessionToken - Session token
 * @param {string} otp - OTP to verify
 * @returns {Object} Verification result
 */
const verifySimulatedOtp = (sessionToken, otp) => {
  const stored = otpStore.get(sessionToken);
  
  if (!stored) {
    return {
      valid: false,
      message: 'OTP session not found or expired',
      remainingAttempts: 0
    };
  }
  
  // Check expiration
  if (new Date() > stored.expiresAt) {
    otpStore.delete(sessionToken);
    return {
      valid: false,
      message: 'OTP has expired',
      remainingAttempts: 0
    };
  }
  
  // Check attempt limit
  if (stored.attempts >= stored.maxAttempts) {
    otpStore.delete(sessionToken);
    return {
      valid: false,
      message: 'Maximum OTP attempts exceeded',
      remainingAttempts: 0
    };
  }
  
  // Increment attempt counter
  stored.attempts += 1;
  otpStore.set(sessionToken, stored);
  
  // Verify OTP
  if (stored.otp === otp) {
    // Clear OTP after successful verification
    otpStore.delete(sessionToken);
    return {
      valid: true,
      message: 'OTP verified successfully',
      remainingAttempts: stored.maxAttempts - stored.attempts
    };
  }
  
  const remainingAttempts = stored.maxAttempts - stored.attempts;
  return {
    valid: false,
    message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining`,
    remainingAttempts
  };
};

/**
 * Resend OTP - generates new OTP for same session
 * @param {string} sessionToken - Session token
 * @param {string} email - User email
 * @param {string} userName - User name
 * @returns {Promise<Object>} New OTP details
 */
const resendSimulatedOtp = async (sessionToken, email, userName = 'User') => {
  // Remove old OTP if exists
  otpStore.delete(sessionToken);
  
  // Generate new OTP
  const newOtp = generateOtp();
  
  // Send new simulated OTP
  return sendSimulatedOtp(email, newOtp, userName, sessionToken);
};

/**
 * Get OTP details for development (only in dev mode)
 * @param {string} sessionToken - Session token
 * @returns {Object|null} OTP details or null
 */
const getOtpDetails = (sessionToken) => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const stored = otpStore.get(sessionToken);
  if (!stored) return null;
  
  return {
    otp: stored.otp,
    email: stored.email,
    expiresAt: stored.expiresAt,
    attempts: stored.attempts,
    maxAttempts: stored.maxAttempts,
    expiresIn: Math.max(0, Math.floor((stored.expiresAt - new Date()) / 1000))
  };
};

/**
 * Clean up expired OTPs from memory
 */
const cleanupExpiredOtps = () => {
  const now = new Date();
  for (const [sessionToken, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(sessionToken);
    }
  }
};

// Run cleanup every minute
setInterval(cleanupExpiredOtps, 60 * 1000);

module.exports = {
  generateOtp,
  sendSimulatedOtp,
  verifySimulatedOtp,
  resendSimulatedOtp,
  getOtpDetails
};