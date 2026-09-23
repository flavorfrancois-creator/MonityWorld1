import { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('monity_token');
    if (token) {
      API.get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('monity_token');
          localStorage.removeItem('monity_user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('monity_token', token);
    localStorage.setItem('monity_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = (redirectPath = '/') => {
    localStorage.removeItem('monity_token');
    localStorage.removeItem('monity_user');
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
