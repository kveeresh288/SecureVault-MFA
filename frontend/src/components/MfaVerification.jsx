import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const MfaVerification = ({ sessionData: initialSessionData, onBack }) => {
  const { verifyMfa, switchMfaChannel } = useAuth();
  const [sessionData, setSessionData] = useState(initialSessionData);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(initialSessionData.expiresIn || 300);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { channel, email, otp: devOtp, emailHint, availableMethods = ['email'] } = sessionData;
  const isDevelopment = import.meta.env.DEV;
  const canSwitch = availableMethods.length > 1;

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleOtpChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto‑focus next input
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await verifyMfa(sessionData.sessionToken, otpString);
      if (!result.success) {
        setError(result.message || 'Verification failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchChannel = async (newChannel) => {
    if (newChannel === channel || switching) return;
    setSwitching(true); setError('');
    try {
      const res = await switchMfaChannel(sessionData.sessionToken, newChannel);
      if (res.success) {
        setSessionData({
          ...sessionData,
          sessionToken: res.data.sessionToken,
          channel: res.data.mfaChannel,
          otp: res.data.otp || null,
          emailHint: res.data.emailHint || sessionData.emailHint,
          expiresIn: res.data.expiresIn || 300,
        });
        setOtp(['', '', '', '', '', '']);
        setTimeLeft(res.data.expiresIn || 300);
        setResendCooldown(0);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not switch method.');
    } finally { setSwitching(false); }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    
    setResendCooldown(30); // 30 seconds cooldown
    setError('');
    setOtp(['', '', '', '', '', '']);
    document.getElementById('otp-0')?.focus();

    try {
      // Call resend OTP API endpoint
      const response = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionToken: sessionData.sessionToken,
          email: sessionData.email,
          channel: sessionData.channel,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Update OTP and expiry time if provided (development mode)
        if (result.data?.otp && isDevelopment) {
          // The new OTP will be displayed in the development OTP section
          // We don't need to update state as it's already in sessionData
        }
        setTimeLeft(result.data?.expiresIn || 300); // Reset timer
      } else {
        setError(result.message || 'Failed to resend OTP');
      }
    } catch (err) {
      console.error('Resend OTP error:', err);
      // In development mode, we can simulate success
      if (isDevelopment) {
        setTimeLeft(300); // Reset timer to 5 minutes
      } else {
        setError('Network error - could not resend OTP');
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center">
        <p className="text-gray-300 mb-2">
          Enter the 6‑digit code sent via{' '}
          <span className="font-semibold text-cyan-300">
            {channel === 'email' ? 'Email' : 'Authenticator App'}
          </span>
        </p>
        <p className="text-sm text-gray-400">{email}</p>
      </div>

      {/* Method toggle — shown when account has both email + TOTP */}
      {canSwitch && (
        <div className="flex gap-2 p-1 bg-gray-900 rounded-lg border border-gray-700">
          {availableMethods.map((method) => (
            <button
              key={method}
              type="button"
              disabled={switching}
              onClick={() => handleSwitchChannel(method)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition ${
                channel === method
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {method === 'email' ? '📧 Email OTP' : '📱 Authenticator App'}
            </button>
          ))}
        </div>
      )}
      {switching && <p className="text-center text-xs text-gray-400">Switching method…</p>}

      {/* Development Mode OTP Display */}
      {isDevelopment && devOtp && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-yellow-300 font-semibold">🛠️ Dev Mode — OTP</span>
            <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-1 rounded">
              No email sent
            </span>
          </div>
          <div className="text-center mb-3">
            <div className="text-3xl font-bold tracking-widest text-yellow-300 mb-1 font-mono">
              {devOtp}
            </div>
            <div className="text-xs text-yellow-400">
              Expires in {formatTime(timeLeft)}
              {emailHint && ` • ${emailHint}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const digits = devOtp.split('');
              setOtp(digits);
            }}
            className="w-full text-xs font-semibold py-2 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition"
          >
            ⚡ Auto-fill OTP
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="flex justify-center gap-3">
        {otp.map((digit, idx) => (
          <input
            key={idx}
            id={`otp-${idx}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleOtpChange(idx, e.target.value)}
            className="w-12 h-14 text-center text-2xl font-bold bg-gray-900 border border-gray-700 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
            autoFocus={idx === 0}
          />
        ))}
      </div>

      <div className="text-center space-y-4">
        <div className="text-sm">
          <span className="text-gray-400">Code expires in </span>
          <span
            className={`font-mono ${
              timeLeft < 60 ? 'text-red-400' : 'text-cyan-400'
            }`}
          >
            {formatTime(timeLeft)}
          </span>
        </div>

        <button
          type="submit"
          disabled={loading || otp.join('').length !== 6}
          className="btn btn-primary w-full"
        >
          {loading ? (
            <>
              <span className="animate-spin mr-2">⟳</span>
              Verifying...
            </>
          ) : (
            'Verify & Sign In'
          )}
        </button>

        <div className="flex justify-between text-sm">
          <button
            type="button"
            onClick={onBack}
            className="text-gray-400 hover:text-gray-300"
          >
            ← Back to login
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-cyan-400 hover:text-cyan-300 disabled:text-gray-500"
          >
            {resendCooldown > 0
              ? `Resend available in ${resendCooldown}s`
              : 'Resend code'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default MfaVerification;