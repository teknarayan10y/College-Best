// src/auth/storage.js
export const tokenKey = 'access_token';
export const setToken = (t) => localStorage.setItem(tokenKey, t);
export const getToken = () => localStorage.getItem(tokenKey);
export const clearToken = () => localStorage.removeItem(tokenKey);

// NEW: user helpers
const userKey = 'current_user';
export const setUser = (u) => localStorage.setItem(userKey, JSON.stringify(u));
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(userKey) || 'null'); }
  catch { return null; }
};
export const clearUser = () => localStorage.removeItem(userKey);