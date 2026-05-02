import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PasskeyLoginButton } from './PasskeyManager';

const LoginForm = ({ onMfaRequired, onSwitchToRegister, onForgotPassword }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await login(email, password);
      if (result.success) {
        // Password correct, proceed to MFA
        onMfaRequired({
          sessionToken: result.data.sessionToken,
          channel: result.data.mfaChannel || result.data.channel,
          availableMethods: result.data.availableMethods || ['email'],
          email,
          otp: result.data.otp,
          expiresIn: result.data.expiresIn,
          emailHint: result.data.emailHint,
        });
      } else {
        setError(result.message || 'Login failed');
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Email Address
        </label>
        <input
          type="email"
          required
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-300">Password</label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            Forgot password?
          </button>
        </div>
        <input
          type="password"
          required
          className="input"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary w-full"
      >
        {loading ? (
          <>
            <span className="animate-spin mr-2">⟳</span>
            Verifying...
          </>
        ) : (
          'Continue to MFA'
        )}
      </button>

      {/* Passkey sign-in */}
      <div className="pt-2">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-500">or</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>
        <PasskeyLoginButton email={email} />
      </div>

      <div className="text-center pt-4 border-t border-gray-800">
        <p className="text-sm text-gray-400">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-cyan-400 hover:text-cyan-300 font-medium"
          >
            Create one
          </button>
        </p>
      </div>
    </form>
  );
};

export default LoginForm;