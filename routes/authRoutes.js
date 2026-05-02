const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  verifyMfa,
  verifyTotpSetup,
  dashboard,
  logout,
  health,
  resendOtp,
  getLoginHistory,
  updateProfile,
  changePassword,
  changeMfaMethod,
  forgotPassword,
  resetPassword,
  switchMfaChannel,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const {
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyAuthOptions,
  passkeyAuthVerify,
  listPasskeys,
  deletePasskey,
} = require('../controllers/passkeyController');

const router = express.Router();

// ─── Validation Rules ──────────────────────────────────────────────────────────

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  body('preferredMfaChannel')
    .optional()
    .isIn(['email', 'totp'])
    .withMessage('MFA channel must be either "email" or "totp"'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const verifyMfaValidation = [
  body('sessionToken').notEmpty().withMessage('Session token is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be exactly 6 digits')
    .matches(/^\d+$/)
    .withMessage('OTP must contain only digits'),
];

const verifyTotpSetupValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('totpToken')
    .isLength({ min: 6, max: 6 })
    .withMessage('TOTP token must be exactly 6 digits')
    .matches(/^\d+$/)
    .withMessage('TOTP token must contain only digits'),
];

const resendOtpValidation = [
  body('sessionToken').notEmpty().withMessage('Session token is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('channel').isIn(['email', 'totp']).withMessage('Channel must be either "email" or "totp"'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/verify-mfa', verifyMfaValidation, verifyMfa);
router.post('/resend-otp', resendOtpValidation, resendOtp);
router.post('/verify-totp-setup', verifyTotpSetupValidation, verifyTotpSetup);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/switch-mfa-channel', switchMfaChannel);

// Protected routes (require valid JWT cookie)
router.get('/dashboard', authenticate, dashboard);
router.post('/logout', authenticate, logout);
router.get('/login-history', authenticate, getLoginHistory);
router.put('/update-profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);
router.put('/change-mfa', authenticate, changeMfaMethod);

// Health check (public)
router.get('/health', health);

// ─── Passkey routes ───────────────────────────────────────────────────────────
router.post('/passkey/auth-options', passkeyAuthOptions);        // public
router.post('/passkey/auth-verify',  passkeyAuthVerify);         // public
router.get ('/passkey/register-options', authenticate, passkeyRegisterOptions);
router.post('/passkey/register-verify',  authenticate, passkeyRegisterVerify);
router.get ('/passkey/list',   authenticate, listPasskeys);
router.delete('/passkey/:id',  authenticate, deletePasskey);

module.exports = router;