const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

// Configure TOTP (RFC 6238)
authenticator.options = {
  window: 1, // Allow 1 step before/after for clock skew
  step: 30,  // 30‑second intervals
};

/**
 * Generate a new TOTP secret (base32)
 * @returns {string} 32‑character base32 secret
 */
const generateTotpSecret = () => {
  return authenticator.generateSecret();
};

/**
 * Generate a QR code image (data URL) for the user to scan.
 * @param {string} email - User's email (used as label)
 * @param {string} secret - TOTP secret (base32)
 * @returns {Promise<string>} Data URL of the QR code (PNG)
 */
const generateQrCode = async (email, secret) => {
  const otpauth = authenticator.keyuri(email, 'SecureVault', secret);
  try {
    const dataUrl = await QRCode.toDataURL(otpauth);
    return dataUrl;
  } catch (err) {
    console.error('[TOTP Service] Failed to generate QR code:', err.message);
    throw new Error('Could not generate QR code');
  }
};

/**
 * Verify a TOTP token against a secret.
 * @param {string} token - 6‑digit token from the user
 * @param {string} secret - TOTP secret (base32)
 * @returns {boolean} True if token is valid
 */
const verifyTotpToken = (token, secret) => {
  try {
    return authenticator.verify({ token, secret });
  } catch (err) {
    console.error('[TOTP Service] Token verification error:', err.message);
    return false;
  }
};

/**
 * Generate a current TOTP token for a given secret (useful for testing).
 * @param {string} secret - TOTP secret (base32)
 * @returns {string} 6‑digit token
 */
const generateCurrentTotp = (secret) => {
  return authenticator.generate(secret);
};

module.exports = {
  generateTotpSecret,
  generateQrCode,
  verifyTotpToken,
  generateCurrentTotp,
};