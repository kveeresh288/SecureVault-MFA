import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const ForgotPassword = ({ onBack }) => {
  const { forgotPassword, resetPassword } = useAuth();
  const isDevelopment = import.meta.env.DEV;

  // step: 'email' → 'otp' → 'done'
  const [step, setStep] = useState('email');

  const [email, setEmail]               = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [emailHint, setEmailHint]       = useState('');
  const [devOtp, setDevOtp]             = useState('');

  const [otp, setOtp]           = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // ─── Step 1: Send reset code ─────────────────────────────────────────────
  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!email) return setError('Please enter your email.');
    setLoading(true); setError('');
    try {
      const res = await forgotPassword(email);
      if (res.success) {
        setSessionToken(res.data.sessionToken);
        setEmailHint(res.data.emailHint || email);
        if (res.data.otp) setDevOtp(res.data.otp);
        setStep('otp');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Try again.');
    } finally { setLoading(false); }
  };

  // ─── OTP digit inputs ────────────────────────────────────────────────────
  const handleOtpChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp]; next[index] = value; setOtp(next);
    if (value && index < 5) document.getElementById(`rotp-${index + 1}`)?.focus();
  };

  const autoFill = () => {
    if (devOtp.length === 6) setOtp(devOtp.split(''));
  };

  // ─── Step 2: Verify code + set new password ──────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) return setError('Enter all 6 digits.');
    if (!newPassword)       return setError('Enter a new password.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');

    setLoading(true); setError('');
    try {
      const res = await resetPassword(sessionToken, code, newPassword);
      if (res.success) setStep('done');
      else setError(res.message || 'Reset failed.');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
    } finally { setLoading(false); }
  };

  // ─── Done ─────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl mb-2">✅</div>
        <h3 className="text-lg font-bold text-green-400">Password Reset!</h3>
        <p className="text-sm text-gray-400">Your password has been updated. You can now sign in.</p>
        <button onClick={onBack} className="btn btn-primary w-full mt-4">
          Back to Sign In
        </button>
      </div>
    );
  }

  // ─── OTP + new password form ──────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <form onSubmit={handleReset} className="space-y-5">
        <div className="text-center">
          <p className="text-gray-300 text-sm">
            Reset code sent to <span className="text-cyan-300 font-semibold">{emailHint}</span>
          </p>
        </div>

        {/* Dev mode OTP box */}
        {isDevelopment && devOtp && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-yellow-300 text-xs font-semibold">🛠️ Dev Mode — Reset Code</span>
              <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded">No email sent</span>
            </div>
            <div className="text-center text-2xl font-bold font-mono tracking-widest text-yellow-300 mb-2">{devOtp}</div>
            <button type="button" onClick={autoFill}
              className="w-full text-xs font-semibold py-1.5 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition">
              ⚡ Auto-fill Code
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded">{error}</div>
        )}

        {/* OTP digits */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Reset Code</label>
          <div className="flex justify-center gap-2">
            {otp.map((digit, idx) => (
              <input
                key={idx} id={`rotp-${idx}`}
                type="text" inputMode="numeric" maxLength={1}
                value={digit} onChange={(e) => handleOtpChange(idx, e.target.value)}
                className="w-11 h-13 text-center text-xl font-bold bg-gray-900 border border-gray-700 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                autoFocus={idx === 0}
              />
            ))}
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
          <input type="password" className="input" placeholder="••••••••"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">Min 8 chars with uppercase, lowercase, and a number.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
          <input type="password" className="input" placeholder="••••••••"
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </div>

        <button type="submit" disabled={loading || otp.join('').length !== 6} className="btn btn-primary w-full">
          {loading ? <><span className="animate-spin mr-2">⟳</span>Resetting…</> : 'Reset Password'}
        </button>

        <button type="button" onClick={() => { setStep('email'); setOtp(['','','','','','']); setError(''); }}
          className="text-sm text-gray-500 hover:text-gray-300 w-full text-center block">
          ← Try a different email
        </button>
      </form>
    );
  }

  // ─── Email input form ─────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSendCode} className="space-y-4">
      <p className="text-sm text-gray-400">
        Enter your registered email and we'll send you a reset code.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
        <input type="email" required className="input" placeholder="you@example.com"
          value={email} onChange={e => setEmail(e.target.value)} autoFocus />
      </div>

      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? <><span className="animate-spin mr-2">⟳</span>Sending…</> : 'Send Reset Code'}
      </button>

      <div className="text-center pt-3 border-t border-gray-800">
        <button type="button" onClick={onBack} className="text-sm text-gray-400 hover:text-gray-300">
          ← Back to Sign In
        </button>
      </div>
    </form>
  );
};

export default ForgotPassword;
