import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Register = ({ onSwitchToLogin }) => {
  const { register, verifyTotpSetup } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    preferredMfaChannel: 'email',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // TOTP setup step shown after successful TOTP registration
  const [totpSetup, setTotpSetup] = useState(null); // { qrCode, mfaSecret, userId }
  const [totpToken, setTotpToken] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [totpVerified, setTotpVerified] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      const result = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        preferredMfaChannel: form.preferredMfaChannel,
      });

      if (result.success) {
        if (form.preferredMfaChannel === 'totp' && result.data.qrCode) {
          setTotpSetup({
            qrCode: result.data.qrCode,
            mfaSecret: result.data.mfaSecret,
            userId: result.data.userId,
          });
        } else {
          // Email OTP registration — go straight to login
          onSwitchToLogin();
        }
      } else {
        setError(result.message || 'Registration failed');
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        setError(data.errors.map((e) => e.msg).join(' • '));
      } else {
        setError(data?.message || 'Network error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotpVerify = async (e) => {
    e.preventDefault();
    if (totpToken.length !== 6) return setTotpError('Enter the 6-digit code from your app');
    setTotpLoading(true);
    setTotpError('');
    try {
      const result = await verifyTotpSetup(totpSetup.userId, totpToken);
      if (result.success) {
        setTotpVerified(true);
      } else {
        setTotpError(result.message || 'Verification failed');
      }
    } catch (err) {
      setTotpError(err.response?.data?.message || 'Invalid code. Try again.');
    } finally {
      setTotpLoading(false);
    }
  };

  // ─── TOTP verified success screen ───────────────────────────────────────────
  if (totpVerified) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl mb-2">✅</div>
        <h3 className="text-lg font-bold text-green-400">Authenticator App Linked!</h3>
        <p className="text-sm text-gray-400">
          Your account is set up. Use your authenticator app to log in.
        </p>
        <button
          onClick={onSwitchToLogin}
          className="btn btn-primary w-full mt-4"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  // ─── TOTP QR Code + verification step ───────────────────────────────────────
  if (totpSetup) {
    return (
      <form onSubmit={handleTotpVerify} className="space-y-5">
        <div className="text-center">
          <div className="text-2xl mb-1">📱</div>
          <h3 className="text-base font-bold text-cyan-400">Scan QR Code</h3>
          <p className="text-xs text-gray-400 mt-1">
            Open <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app and scan this code.
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div style={{ background: '#fff', padding: 12, borderRadius: 10 }}>
            <img
              src={totpSetup.qrCode}
              alt="TOTP QR Code"
              style={{ width: 180, height: 180, display: 'block' }}
            />
          </div>
        </div>

        {/* Manual secret fallback */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Can't scan? Enter this key manually:</p>
          <code className="text-xs text-cyan-400 font-mono tracking-wider break-all">
            {totpSetup.mfaSecret}
          </code>
        </div>

        {/* Verification input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Enter the 6-digit code from your app
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={totpToken}
            onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input text-center text-2xl font-bold tracking-widest font-mono"
            placeholder="000000"
            autoFocus
          />
        </div>

        {totpError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded">
            {totpError}
          </div>
        )}

        <button type="submit" disabled={totpLoading || totpToken.length !== 6} className="btn btn-primary w-full">
          {totpLoading ? 'Verifying…' : 'Confirm & Complete Setup'}
        </button>

        <button
          type="button"
          onClick={() => { setTotpSetup(null); setForm({ ...form, preferredMfaChannel: 'email' }); }}
          className="text-sm text-gray-500 hover:text-gray-300 w-full text-center block"
        >
          ← Back to registration
        </button>
      </form>
    );
  }

  // ─── Registration form ───────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
        <input type="text" name="name" required className="input" placeholder="John Doe"
          value={form.name} onChange={handleChange} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
        <input type="email" name="email" required className="input" placeholder="you@example.com"
          value={form.email} onChange={handleChange} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input type="password" name="password" required className="input" placeholder="••••••••"
          value={form.password} onChange={handleChange} />
        <p className="text-xs text-gray-500 mt-1">
          At least 8 characters with uppercase, lowercase, and a number.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
        <input type="password" name="confirmPassword" required className="input" placeholder="••••••••"
          value={form.confirmPassword} onChange={handleChange} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Preferred MFA Method</label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input type="radio" name="preferredMfaChannel" value="email"
              checked={form.preferredMfaChannel === 'email'} onChange={handleChange} className="mr-2" />
            <span className="text-gray-300">Email OTP</span>
          </label>
          <label className="flex items-center">
            <input type="radio" name="preferredMfaChannel" value="totp"
              checked={form.preferredMfaChannel === 'totp'} onChange={handleChange} className="mr-2" />
            <span className="text-gray-300">Authenticator App (TOTP)</span>
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {form.preferredMfaChannel === 'email'
            ? 'A 6‑digit code will be emailed to you each time you log in.'
            : 'You will scan a QR code with Google Authenticator or Authy.'}
        </p>
      </div>

      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? (
          <><span className="animate-spin mr-2">⟳</span>Creating account…</>
        ) : 'Create Account'}
      </button>

      <div className="text-center pt-4 border-t border-gray-800">
        <p className="text-sm text-gray-400">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="text-cyan-400 hover:text-cyan-300 font-medium">
            Sign in
          </button>
        </p>
      </div>
    </form>
  );
};

export default Register;
