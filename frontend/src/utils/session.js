export const isAdminArea = () => window.location.pathname.startsWith('/admin');
export const tokenKey = () => (isAdminArea() ? 'monity_admin_token' : 'monity_token');
export const userKey = () => (isAdminArea() ? 'monity_admin_user' : 'monity_user');
