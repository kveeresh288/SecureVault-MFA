import { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

// Axios instance with credentials (for HttpOnly cookies)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 10000, // 10 second timeout
});

// Add request interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - server may be offline');
      return Promise.reject(new Error('Request timeout. Please check your connection.'));
    }
    if (!error.response) {
      console.error('Network error - backend may be unreachable');
      return Promise.reject(new Error('Network error. Please check your internet connection.'));
    }
    return Promise.reject(error);
  }
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkError, setNetworkError] = useState(null);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkError(null);
      console.log('Application is online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNetworkError('You are offline. Some features may be unavailable.');
      console.log('Application is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check if user is already logged in (JWT cookie exists)
  const checkAuth = async () => {
    if (!isOnline) {
      setNetworkError('Cannot check authentication while offline');
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get('/auth/dashboard');
      setUser(data.data.user);
      setNetworkError(null);
    } catch (err) {
      // Don't set user to null on network errors, only on auth errors
      if (err.response && err.response.status === 401) {
        setUser(null);
        setNetworkError(null); // 401 means backend is reachable — clear any prior network error
      } else if (!err.response) {
        setNetworkError('Cannot connect to server. Please check your connection.');
      }
      console.error('Auth check failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Login (step 1: password verification)
  const login = async (email, password) => {
    if (!isOnline) {
      throw new Error('Cannot login while offline. Please check your internet connection.');
    }

    try {
      const { data } = await api.post('/auth/login', { email, password });
      setNetworkError(null);
      return data;
    } catch (err) {
      if (!err.response) {
        setNetworkError('Cannot connect to server. Please check your connection.');
        throw new Error('Network error. Please check your internet connection.');
      }
      throw err;
    }
  };

  // Verify MFA (step 2: OTP verification)
  const verifyMfa = async (sessionToken, otp) => {
    if (!isOnline) {
      throw new Error('Cannot verify OTP while offline. Please check your internet connection.');
    }

    try {
      const { data } = await api.post('/auth/verify-mfa', { sessionToken, otp });
      if (data.success) {
        await checkAuth(); // Refresh user state
      }
      setNetworkError(null);
      return data;
    } catch (err) {
      if (!err.response) {
        setNetworkError('Cannot connect to server. Please check your connection.');
        throw new Error('Network error. Please check your internet connection.');
      }
      throw err;
    }
  };

  // Register new account
  const register = async (userData) => {
    if (!isOnline) {
      throw new Error('Cannot register while offline. Please check your internet connection.');
    }

    try {
      const { data } = await api.post('/auth/register', userData);
      setNetworkError(null);
      return data;
    } catch (err) {
      if (!err.response) {
        setNetworkError('Cannot connect to server. Please check your connection.');
        throw new Error('Network error. Please check your internet connection.');
      }
      throw err;
    }
  };

  // Verify TOTP setup (after scanning QR)
  const verifyTotpSetup = async (userId, totpToken) => {
    if (!isOnline) {
      throw new Error('Cannot verify TOTP setup while offline. Please check your internet connection.');
    }

    try {
      const { data } = await api.post('/auth/verify-totp-setup', { userId, totpToken });
      setNetworkError(null);
      return data;
    } catch (err) {
      if (!err.response) {
        setNetworkError('Cannot connect to server. Please check your connection.');
        throw new Error('Network error. Please check your internet connection.');
      }
      throw err;
    }
  };

  // Logout
  const logout = async () => {
    if (!isOnline) {
      // Still allow logout locally even if offline
      setUser(null);
      return;
    }

    try {
      await api.post('/auth/logout');
      setUser(null);
      setNetworkError(null);
    } catch (err) {
      // Even if logout fails, clear user locally
      setUser(null);
      if (!err.response) {
        setNetworkError('Cannot connect to server. Logged out locally only.');
      }
    }
  };

  // Retry connection
  const retryConnection = async () => {
    setNetworkError(null);
    setLoading(true);
    await checkAuth();
  };

  const forgotPassword = async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  };

  const resetPassword = async (sessionToken, otp, newPassword) => {
    const { data } = await api.post('/auth/reset-password', { sessionToken, otp, newPassword });
    return data;
  };

  const switchMfaChannel = async (sessionToken, newChannel) => {
    const { data } = await api.post('/auth/switch-mfa-channel', { sessionToken, newChannel });
    return data;
  };

  const getLoginHistory = async () => {
    const { data } = await api.get('/auth/login-history');
    return data;
  };

  const updateProfile = async (name) => {
    const { data } = await api.put('/auth/update-profile', { name });
    if (data.success) await checkAuth();
    return data;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const { data } = await api.put('/auth/change-password', { currentPassword, newPassword });
    return data;
  };

  const changeMfaMethod = async (newChannel, password) => {
    const { data } = await api.put('/auth/change-mfa', { newChannel, password });
    if (data.success) await checkAuth();
    return data;
  };

  // ─── Passkey API ─────────────────────────────────────────────────────────────
  const passkeyGetRegisterOptions = async () => {
    const { data } = await api.get('/auth/passkey/register-options');
    return data;
  };

  const passkeyRegisterVerify = async (credential, name) => {
    const { data } = await api.post('/auth/passkey/register-verify', { credential, name });
    return data;
  };

  const passkeyGetAuthOptions = async (email) => {
    const { data } = await api.post('/auth/passkey/auth-options', { email });
    return data;
  };

  const passkeyAuthVerify = async (credential, storeKey) => {
    const { data } = await api.post('/auth/passkey/auth-verify', { credential, storeKey });
    if (data.success) await checkAuth();
    return data;
  };

  const listPasskeys = async () => {
    const { data } = await api.get('/auth/passkey/list');
    return data;
  };

  const deletePasskey = async (id) => {
    const { data } = await api.delete(`/auth/passkey/${id}`);
    return data;
  };

  const value = {
    user,
    loading,
    isOnline,
    networkError,
    login,
    verifyMfa,
    register,
    verifyTotpSetup,
    logout,
    checkAuth,
    retryConnection,
    getLoginHistory,
    updateProfile,
    changePassword,
    changeMfaMethod,
    forgotPassword,
    resetPassword,
    switchMfaChannel,
    passkeyGetRegisterOptions,
    passkeyRegisterVerify,
    passkeyGetAuthOptions,
    passkeyAuthVerify,
    listPasskeys,
    deletePasskey,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;