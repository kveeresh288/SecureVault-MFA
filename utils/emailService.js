const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // App‑specific password, NOT your regular Gmail password
  },
});

/**
 * Send a 6‑digit OTP to the user's email.
 * @param {string} to - Recipient email address
 * @param {string} otp - 6‑digit OTP
 * @param {string} userName - User's name for personalization
 * @returns {Promise<Object>} Nodemailer result
 */
const sendOtpEmail = async (to, otp, userName = 'User') => {
  const mailOptions = {
    from: `"SecureVault MFA" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SecureVault Authentication Code',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background: #f9f9f9;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #0ea5e9; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">SECUREVAULT</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Multi‑Factor Authentication</p>
        </div>

        <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${userName},</h2>
          <p style="color: #475569; line-height: 1.6;">
            Use the following code to complete your login. This code will expire in <strong>5 minutes</strong>.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #06b6d4); color: white; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 32px; border-radius: 8px; font-family: monospace;">
              ${otp}
            </div>
          </div>

          <p style="color: #475569; font-size: 13px; line-height: 1.5;">
            If you didn't request this code, please ignore this email or contact our support team immediately.
          </p>
        </div>

        <div style="margin-top: 24px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>This is an automated message from SecureVault MFA System.</p>
          <p>© ${new Date().getFullYear()} SecureVault. All rights reserved.</p>
        </div>
      </div>
    `,
    text: `Your SecureVault authentication code is: ${otp}. This code expires in 5 minutes.`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] OTP sent to ${to}, message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Failed to send OTP:', error.message);
    throw new Error('Failed to send OTP email');
  }
};

const sendPasswordResetEmail = async (to, otp, userName = 'User') => {
  const mailOptions = {
    from: `"SecureVault MFA" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset Your SecureVault Password',
    html: `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:12px;background:#f9f9f9;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#0ea5e9;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">SECUREVAULT</h1>
          <p style="color:#64748b;font-size:14px;margin-top:4px;">Password Reset</p>
        </div>
        <div style="background:white;border-radius:8px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
          <h2 style="color:#1e293b;margin-top:0;">Hello ${userName},</h2>
          <p style="color:#475569;line-height:1.6;">
            We received a request to reset your password. Use the code below. It expires in <strong>10 minutes</strong>.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <div style="display:inline-block;background:linear-gradient(135deg,#f97316,#ef4444);color:white;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 32px;border-radius:8px;font-family:monospace;">
              ${otp}
            </div>
          </div>
          <p style="color:#475569;font-size:13px;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
        <div style="margin-top:24px;text-align:center;color:#94a3b8;font-size:12px;">
          <p>© ${new Date().getFullYear()} SecureVault. All rights reserved.</p>
        </div>
      </div>
    `,
    text: `Your SecureVault password reset code is: ${otp}. It expires in 10 minutes.`,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Reset email sent to ${to}, message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Failed to send reset email:', error.message);
    throw new Error('Failed to send password reset email');
  }
};

module.exports = { sendOtpEmail, sendPasswordResetEmail };