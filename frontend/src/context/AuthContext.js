import { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api';
import { tokenKey, userKey } from '../utils/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(tokenKey());
    if (token) {
      API.get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem(tokenKey());
          localStorage.removeItem(userKey());
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !localStorage.getItem(tokenKey())) return undefined;

    const synchronize = async () => {
      try {
        const res = await API.get('/system/sync');
        const current = JSON.parse(localStorage.getItem(userKey()) || '{}');
        const synchronizedUser = {
          ...current,
          ...(res.data.user || {}),
          updated_at: res.data.user_updated_at || current.updated_at,
          permissions_updated_at: res.data.permissions_updated_at || current.permissions_updated_at,
          services_updated_at: res.data.services_updated_at || current.services_updated_at,
        };
        localStorage.setItem(userKey(), JSON.stringify(synchronizedUser));
        setUser(synchronizedUser);
      } catch (error) {
        console.error('Periodic synchronization failed', error);
      }
    };

    synchronize();
    const interval = window.setInterval(synchronize, 60000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  const login = (token, userData) => {
    localStorage.setItem(tokenKey(), token);
    localStorage.setItem(userKey(), JSON.stringify(userData));
    setUser(userData);
  };

  const logout = (redirectPath = '/') => {
    localStorage.removeItem(tokenKey());
    localStorage.removeItem(userKey());
    setUser(null);
    window.location.href = redirectPath;
  };

  const refreshUser = async () => {
    try {
      const res = await API.get('/auth/me');
      setUser(res.data);
      return res.data;
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
