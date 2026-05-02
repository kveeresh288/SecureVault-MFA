import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PasskeyRegisterPanel } from './PasskeyManager';

// ─── Shared modal wrapper ─────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0d1117', border: '1px solid #21262d',
        borderRadius: 12, padding: '28px 28px 24px',
        width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusMsg({ msg }) {
  if (!msg.text) return null;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14,
      background: msg.type === 'error' ? 'rgba(248,81,73,0.1)' : 'rgba(63,185,80,0.1)',
      border: `1px solid ${msg.type === 'error' ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`,
      color: msg.type === 'error' ? '#f85149' : '#3fb950',
    }}>
      {msg.text}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#161b22', border: '1px solid #30363d',
  borderRadius: 6, padding: '9px 12px', color: '#e6edf3',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const btnPrimary = {
  background: 'linear-gradient(135deg,#00d4ff,#0099cc)', color: '#000',
  border: 'none', borderRadius: 6, padding: '10px 20px',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%',
};

const btnSecondary = {
  background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d',
  borderRadius: 6, padding: '10px 20px',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', width: '100%',
  marginTop: 8,
};

// ─── Account Settings Modal ───────────────────────────────────────────────────
function AccountSettingsModal({ onClose }) {
  const { user, updateProfile, changePassword } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const handleNameSave = async () => {
    if (!name.trim()) return;
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await updateProfile(name);
      setMsg({ text: res.message, type: 'success' });
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Failed to update name.', type: 'error' });
    } finally { setLoading(false); }
  };

  const handlePasswordChange = async () => {
    if (!curPw || !newPw) return setMsg({ text: 'Fill in both password fields.', type: 'error' });
    if (newPw !== confPw) return setMsg({ text: 'New passwords do not match.', type: 'error' });
    if (newPw.length < 8) return setMsg({ text: 'New password must be at least 8 characters.', type: 'error' });
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await changePassword(curPw, newPw);
      setMsg({ text: res.message, type: 'success' });
      setCurPw(''); setNewPw(''); setConfPw('');
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Failed to change password.', type: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Account Settings" onClose={onClose}>
      <StatusMsg msg={msg} />

      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#8b949e', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 12 }}>
          Profile
        </p>
        <Field label="Full Name">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input style={{ ...inputStyle, color: '#8b949e', cursor: 'not-allowed' }} value={user?.email} readOnly />
        </Field>
        <button style={btnPrimary} onClick={handleNameSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Name'}
        </button>
      </div>

      <div style={{ borderTop: '1px solid #21262d', paddingTop: 20 }}>
        <p style={{ color: '#8b949e', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 12 }}>
          Change Password
        </p>
        <Field label="Current Password">
          <input style={inputStyle} type="password" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="New Password">
          <input style={inputStyle} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="Confirm New Password">
          <input style={inputStyle} type="password" value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="••••••••" />
        </Field>
        <button style={btnPrimary} onClick={handlePasswordChange} disabled={loading}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Login History Modal ──────────────────────────────────────────────────────
function LoginHistoryModal({ onClose }) {
  const { getLoginHistory } = useAuth();
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useState(() => {
    getLoginHistory()
      .then(res => setEvents(res.data.events))
      .catch(() => setError('Failed to load login history.'))
      .finally(() => setLoading(false));
  });

  return (
    <Modal title="Login History" onClose={onClose}>
      {loading && <p style={{ color: '#8b949e', textAlign: 'center', padding: '20px 0' }}>Loading...</p>}
      {error && <p style={{ color: '#f85149', textAlign: 'center' }}>{error}</p>}
      {events && events.length === 0 && (
        <p style={{ color: '#8b949e', textAlign: 'center', padding: '20px 0' }}>No login history yet.</p>
      )}
      {events && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((ev, i) => (
            <div key={i} style={{
              background: '#161b22', border: '1px solid #21262d',
              borderRadius: 8, padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>
                  {ev.channel === 'totp' ? 'Authenticator App' : 'Email OTP'}
                </div>
                <div style={{ color: '#8b949e', fontSize: 12, marginTop: 2 }}>
                  IP: {ev.ipAddress}
                </div>
              </div>
              <div style={{ color: '#8b949e', fontSize: 12, textAlign: 'right' }}>
                {new Date(ev.at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Change MFA Method Modal ──────────────────────────────────────────────────
function ChangeMfaModal({ onClose }) {
  const { user, changeMfaMethod, verifyTotpSetup } = useAuth();
  const [step, setStep] = useState('select'); // 'select' | 'qr'
  const [selected, setSelected] = useState(user?.preferredMfaChannel === 'email' ? 'totp' : 'email');
  const [password, setPassword] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [userId, setUserId] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const handleSwitch = async () => {
    if (!password) return setMsg({ text: 'Password is required.', type: 'error' });
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await changeMfaMethod(selected, password);
      if (selected === 'totp' && res.data?.qrCode) {
        setQrCode(res.data.qrCode);
        setUserId(res.data.userId);
        setStep('qr');
      } else {
        setMsg({ text: res.message, type: 'success' });
        setTimeout(onClose, 1500);
      }
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Failed to change MFA method.', type: 'error' });
    } finally { setLoading(false); }
  };

  const handleTotpVerify = async () => {
    if (!totpToken || totpToken.length !== 6) return setMsg({ text: 'Enter the 6-digit code.', type: 'error' });
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await verifyTotpSetup(userId, totpToken);
      setMsg({ text: res.message, type: 'success' });
      setTimeout(onClose, 1500);
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Invalid code.', type: 'error' });
    } finally { setLoading(false); }
  };

  if (step === 'qr') {
    return (
      <Modal title="Scan QR Code" onClose={onClose}>
        <StatusMsg msg={msg} />
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 16 }}>
          Scan this QR code with Google Authenticator or Authy, then enter the 6-digit code to confirm.
        </p>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={qrCode} alt="TOTP QR Code" style={{ width: 200, height: 200, borderRadius: 8, background: '#fff', padding: 8 }} />
        </div>
        <Field label="Verification Code">
          <input
            style={{ ...inputStyle, textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
            maxLength={6}
            value={totpToken}
            onChange={e => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </Field>
        <button style={btnPrimary} onClick={handleTotpVerify} disabled={loading}>
          {loading ? 'Verifying...' : 'Confirm Setup'}
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="Change MFA Method" onClose={onClose}>
      <StatusMsg msg={msg} />
      <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 16 }}>
        Current method: <span style={{ color: '#00d4ff', fontWeight: 600 }}>
          {user?.preferredMfaChannel === 'email' ? 'Email OTP' : 'Authenticator App'}
        </span>
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {['email', 'totp'].map(ch => (
          <button
            key={ch}
            onClick={() => setSelected(ch)}
            disabled={ch === user?.preferredMfaChannel}
            style={{
              flex: 1, padding: '12px', borderRadius: 8, cursor: ch === user?.preferredMfaChannel ? 'not-allowed' : 'pointer',
              border: selected === ch ? '2px solid #00d4ff' : '1px solid #30363d',
              background: selected === ch ? 'rgba(0,212,255,0.08)' : '#161b22',
              color: ch === user?.preferredMfaChannel ? '#8b949e' : '#e6edf3',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {ch === 'email' ? '📧 Email OTP' : '📱 Authenticator App'}
            {ch === user?.preferredMfaChannel && <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 400, marginTop: 2 }}>Current</div>}
          </button>
        ))}
      </div>

      <Field label="Confirm with your password">
        <input
          style={inputStyle} type="password" value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter your password to confirm"
        />
      </Field>
      <button style={btnPrimary} onClick={handleSwitch} disabled={loading || selected === user?.preferredMfaChannel}>
        {loading ? 'Switching...' : `Switch to ${selected === 'email' ? 'Email OTP' : 'Authenticator App'}`}
      </button>
      <button style={btnSecondary} onClick={onClose}>Cancel</button>
    </Modal>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, logout } = useAuth();
  const [modal, setModal] = useState(null); // 'settings' | 'history' | 'mfa'

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-6">
      {modal === 'settings' && <AccountSettingsModal onClose={() => setModal(null)} />}
      {modal === 'history'  && <LoginHistoryModal   onClose={() => setModal(null)} />}
      {modal === 'mfa'      && <ChangeMfaModal      onClose={() => setModal(null)} />}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-cyan-400">SECURE</span>VAULT
            </h1>
            <p className="text-gray-400 text-sm">Protected Dashboard</p>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
          >
            Sign Out
          </button>
        </header>

        {/* Welcome card */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-2xl font-bold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-2xl font-bold">Welcome back, {user?.name}!</h2>
              <p className="text-gray-400">{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-900/50 p-4 rounded-xl">
              <p className="text-gray-400 text-sm">MFA Method</p>
              <p className="text-xl font-semibold capitalize">
                {user?.preferredMfaChannel === 'totp' ? 'Authenticator App' : 'Email OTP'}
              </p>
            </div>
            <div className="bg-gray-900/50 p-4 rounded-xl">
              <p className="text-gray-400 text-sm">Account Status</p>
              <p className={`text-xl font-semibold ${user?.isVerified ? 'text-green-400' : 'text-yellow-400'}`}>
                {user?.isVerified ? 'Verified' : 'Pending'}
              </p>
            </div>
            <div className="bg-gray-900/50 p-4 rounded-xl">
              <p className="text-gray-400 text-sm">Member Since</p>
              <p className="text-xl font-semibold">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Security status */}
          <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Security Status</h3>
            <ul className="space-y-3">
              <li className="flex items-center justify-between">
                <span className="text-gray-300">Multi‑Factor Authentication</span>
                <span className="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm">Active</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-300">Last Login</span>
                <span className="text-gray-400">
                  {user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-300">TOTP Verified</span>
                <span className={user?.isTotpVerified ? 'text-green-400' : 'text-yellow-400'}>
                  {user?.isTotpVerified ? 'Yes' : 'No'}
                </span>
              </li>
            </ul>
          </div>

          {/* Quick actions */}
          <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => setModal('mfa')}
                className="w-full text-left p-4 bg-gray-900/50 hover:bg-gray-800 rounded-xl transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Change MFA Method</p>
                    <p className="text-sm text-gray-400">Switch between email OTP and authenticator app</p>
                  </div>
                  <span className="text-2xl">→</span>
                </div>
              </button>

              <button
                onClick={() => setModal('history')}
                className="w-full text-left p-4 bg-gray-900/50 hover:bg-gray-800 rounded-xl transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">View Login History</p>
                    <p className="text-sm text-gray-400">Check recent sign‑in attempts</p>
                  </div>
                  <span className="text-2xl">→</span>
                </div>
              </button>

              <button
                onClick={() => setModal('settings')}
                className="w-full text-left p-4 bg-gray-900/50 hover:bg-gray-800 rounded-xl transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Account Settings</p>
                    <p className="text-sm text-gray-400">Update profile, password, etc.</p>
                  </div>
                  <span className="text-2xl">→</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Passkey management */}
        <div className="mt-8 bg-gray-800/30 border border-gray-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔑</span>
            <div>
              <h3 className="text-xl font-bold">Passkeys</h3>
              <p className="text-gray-400 text-sm">Sign in instantly with your device biometrics — no password needed</p>
            </div>
          </div>
          <PasskeyRegisterPanel />
        </div>

        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>This dashboard is protected by JWT‑based authentication and multi‑factor verification.</p>
          <p className="mt-1">All sensitive actions require re‑authentication.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
