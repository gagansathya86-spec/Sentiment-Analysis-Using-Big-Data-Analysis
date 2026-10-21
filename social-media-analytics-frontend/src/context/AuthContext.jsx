import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'nexusintel.auth';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || saved.expiresAt <= Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return saved;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });

  useEffect(() => {
    const clearSession = () => {
      sessionStorage.removeItem(STORAGE_KEY);
      setSession(null);
    };
    window.addEventListener('auth:expired', clearSession);
    return () => window.removeEventListener('auth:expired', clearSession);
  }, []);

  const login = async (username, password) => {
    const { data } = await api.post('/api/auth/login', { username, password });
    const next = { token: data.access_token, user: data.user, expiresAt: Date.now() + data.expires_in * 1000 };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    return data.user;
  };

  const logout = async () => {
    try {
      if (session?.token) await api.post('/api/auth/logout');
    } finally {
      sessionStorage.removeItem(STORAGE_KEY);
      setSession(null);
    }
  };

  return <AuthContext.Provider value={{ user: session?.user || null, token: session?.token || null, login, logout }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
