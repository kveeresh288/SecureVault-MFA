import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LoginForm from './components/LoginForm';
import MfaVerification from './components/MfaVerification';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ForgotPassword from './components/ForgotPassword';

// ─── Loading screen while checking JWT cookie ─────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '2px solid var(--border)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin-slow 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>Initializing...</p>
      </div>
    </div>
  );
}

// ─── Auth card wrapper ────────────────────────────────────────────────────────
function AuthCard({ children, step }) {
  const stepLabels = {
    login: { badge: '01 / CREDENTIALS', title: 'Sign In', sub: 'Secure access to your vault' },
    register: { badge: '01 / CREATE ACCOUNT', title: 'Get Started', sub: 'Set up multi-factor authentication' },
    mfa: { badge: '02 / VERIFICATION', title: 'Verify Identity', sub: 'Complete 2-step authentication' },
  };
  const info = stepLabels[step] || stepLabels.login;

  return (
    <div
      className="grid-bg"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--bg-void)',
        position: 'relative',
      }}
    >
      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(0,212,255,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Brand */}
        <div className="animate-fade-up" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, background: 'var(--cyan)', display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 2 }}>
              SECUREVAULT
            </span>
            <span style={{ width: 8, height: 8, background: 'var(--cyan)', display: 'inline-block' }} />
          </div>
        </div>

        {/* Card */}
        <div
          className="card animate-fade-up delay-1"
          style={{ padding: '32px 32px 28px' }}
        >
          {/* Step header */}
          <div style={{ marginBottom: 24 }}>
            <div className="badge badge-cyan" style={{ marginBottom: 12 }}>
              {info.badge}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: 4 }}>
              {info.title}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{info.sub}</p>
          </div>

          <div className="divider" style={{ marginBottom: 24 }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {step === 'mfa' ? '◆ MFA CHALLENGE' : '◆ AUTH'}
            </span>
          </div>

          {children}
        </div>

        {/* Footer */}
        <p className="animate-fade-up delay-4" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 20, letterSpacing: 0.5 }}>
          MERN · JWT · BCRYPT · TOTP · NODEMAILER
        </p>
      </div>
    </div>
  );
}

// ─── Network Status Banner ───────────────────────────────────────────────────
function NetworkStatusBanner({ isOnline, networkError, onRetry }) {
  if (isOnline && !networkError) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      padding: '12px 16px',
      background: isOnline ? 'var(--warning-bg)' : 'var(--error-bg)',
      color: isOnline ? 'var(--warning-text)' : 'var(--error-text)',
      fontSize: 13,
      fontFamily: 'var(--font-mono)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: `1px solid ${isOnline ? 'var(--warning-border)' : 'var(--error-border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isOnline ? 'var(--warning)' : 'var(--error)',
        }} />
        <span>
          {!isOnline ? 'You are offline. Some features may be unavailable.' : networkError}
        </span>
      </div>
      <button
        onClick={onRetry}
        style={{
          background: 'transparent',
          border: '1px solid currentColor',
          color: 'inherit',
          padding: '4px 12px',
          fontSize: 11,
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        RETRY
      </button>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, isOnline, networkError, retryConnection } = useAuth();
  const [view, setView] = useState('login'); // 'login' | 'register' | 'mfa' | 'forgot'
  const [mfaSessionData, setMfaSessionData] = useState(null);

  if (loading) return <LoadingScreen />;

  // Authenticated: show dashboard
  if (user) return (
    <>
      <NetworkStatusBanner
        isOnline={isOnline}
        networkError={networkError}
        onRetry={retryConnection}
      />
      <Dashboard />
    </>
  );

  if (view === 'mfa' && mfaSessionData) {
    return (
      <>
        <NetworkStatusBanner
          isOnline={isOnline}
          networkError={networkError}
          onRetry={retryConnection}
        />
        <AuthCard step="mfa">
          <MfaVerification
            sessionData={mfaSessionData}
            onBack={() => { setView('login'); setMfaSessionData(null); }}
          />
        </AuthCard>
      </>
    );
  }

  if (view === 'register') {
    return (
      <>
        <NetworkStatusBanner isOnline={isOnline} networkError={networkError} onRetry={retryConnection} />
        <AuthCard step="register">
          <Register onSwitchToLogin={() => setView('login')} />
        </AuthCard>
      </>
    );
  }

  if (view === 'forgot') {
    return (
      <>
        <NetworkStatusBanner isOnline={isOnline} networkError={networkError} onRetry={retryConnection} />
        <AuthCard step="login">
          <ForgotPassword onBack={() => setView('login')} />
        </AuthCard>
      </>
    );
  }

  return (
    <>
      <NetworkStatusBanner isOnline={isOnline} networkError={networkError} onRetry={retryConnection} />
      <AuthCard step="login">
        <LoginForm
          onMfaRequired={(data) => { setMfaSessionData(data); setView('mfa'); }}
          onSwitchToRegister={() => setView('register')}
          onForgotPassword={() => setView('forgot')}
        />
      </AuthCard>
    </>
  );
}
