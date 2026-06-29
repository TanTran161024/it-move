const rawBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
export const API_URL = `${API_BASE_URL}/api`;
