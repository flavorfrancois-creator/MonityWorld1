import axios from 'axios';

const configuredBackendUrl = process.env.REACT_APP_BACKEND_URL;
// Use the same-origin reverse proxy in production so HTTPS pages never call
// the backend over insecure HTTP.
const BACKEND_URL = window.location.origin;

const API = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 15000,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('monity_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const detail = err.response?.data?.detail || '';
      const isSessionExpired = detail.includes('Session expirée') || detail.includes('autre appareil');
      localStorage.removeItem('monity_token');
      localStorage.removeItem('monity_user');
      if (isSessionExpired) {
        localStorage.setItem('monity_session_expired', 'true');
      }
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default API;
