import { useState, useEffect } from 'react';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useAuth } from '../context/AuthContext';

const supported = browserSupportsWebAuthn();

// ─── Register a new passkey (used inside Dashboard) ───────────────────────────
export function PasskeyRegisterPanel() {
  const { passkeyGetRegisterOptions, passkeyRegisterVerify, listPasskeys, deletePasskey } = useAuth();
  const [passkeys, setPasskeys] = useState([]);
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState({ text: '', type: '' });

  const load = async () => {
    try {
      const res = await listPasskeys();
      setPasskeys(res.data.passkeys || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async () => {
    if (!supported) return setMsg({ text: 'Your browser does not support passkeys.', type: 'error' });
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const optRes  = await passkeyGetRegisterOptions();
      const credential = await startRegistration({ optionsJSON: optRes.data });
      const verRes  = await passkeyRegisterVerify(credential, name || 'My Passkey');
      if (verRes.success) {
        setMsg({ text: verRes.message, type: 'success' });
        setName('');
        await load();
      } else {
        setMsg({ text: verRes.message || 'Registration failed.', type: 'error' });
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setMsg({ text: 'Passkey prompt was dismissed.', type: 'error' });
      } else {
        setMsg({ text: err.response?.data?.message || err.message || 'Registration failed.', type: 'error' });
      }
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this passkey?')) return;
    try {
      await deletePasskey(id);
      await load();
      setMsg({ text: 'Passkey removed.', type: 'success' });
    } catch {
      setMsg({ text: 'Failed to remove passkey.', type: 'error' });
    }
  };

  if (!supported) {
    return (
      <p style={{ color: '#8b949e', fontSize: 13, padding: '12px 0' }}>
        Passkeys are not supported in this browser.
      </p>
    );
  }

  return (
    <div>
      {/* Status message */}
      {msg.text && (
        <div style={{
          padding: '9px 13px', borderRadius: 6, fontSize: 13, marginBottom: 12,
          background: msg.type === 'error' ? 'rgba(248,81,73,0.1)' : 'rgba(63,185,80,0.1)',
          border: `1px solid ${msg.type === 'error' ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`,
          color: msg.type === 'error' ? '#f85149' : '#3fb950',
        }}>{msg.text}</div>
      )}

      {/* Registered passkeys list */}
      {passkeys.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 8 }}>
            Registered Passkeys
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {passkeys.map(pk => (
              <div key={pk._id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '10px 14px',
              }}>
                <div>
                  <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>
                    🔑 {pk.name}
                  </div>
                  <div style={{ color: '#8b949e', fontSize: 11, marginTop: 2 }}>
                    {pk.deviceType === 'multiDevice' ? 'Synced passkey' : 'Device-bound'} •{' '}
                    {new Date(pk.createdAt).toLocaleDateString()}
                    {pk.backedUp && ' • Backed up'}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(pk._id)}
                  style={{
                    background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)',
                    color: '#f85149', borderRadius: 6, padding: '4px 10px', fontSize: 12,
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new passkey */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{
            flex: 1, background: '#161b22', border: '1px solid #30363d',
            borderRadius: 6, padding: '8px 12px', color: '#e6edf3', fontSize: 13, outline: 'none',
          }}
          placeholder="Passkey name (e.g. MacBook Touch ID)"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={50}
        />
        <button
          onClick={handleRegister}
          disabled={loading}
          style={{
            background: 'linear-gradient(135deg,#00d4ff,#0099cc)', color: '#000',
            border: 'none', borderRadius: 6, padding: '8px 16px',
            fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Creating…' : '+ Add Passkey'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>
        Uses your device's biometrics (Touch ID, Face ID, Windows Hello, or a security key).
      </p>
    </div>
  );
}

// ─── Sign-in with passkey button (used on LoginForm) ─────────────────────────
export function PasskeyLoginButton({ email }) {
  const { passkeyGetAuthOptions, passkeyAuthVerify } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  if (!supported) return null;

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const optRes = await passkeyGetAuthOptions(email || undefined);
      const credential = await startAuthentication({ optionsJSON: optRes.data });
      const verRes = await passkeyAuthVerify(credential, optRes.data.storeKey);
      if (!verRes.success) setError(verRes.message || 'Passkey sign-in failed.');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was dismissed.');
      } else {
        setError(err.response?.data?.message || err.message || 'Passkey sign-in failed.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2 rounded mb-2">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-200 font-semibold text-sm transition"
      >
        {loading ? (
          <><span className="animate-spin">⟳</span> Waiting for passkey…</>
        ) : (
          <>🔑 Sign in with Passkey</>
        )}
      </button>
    </div>
  );
}
