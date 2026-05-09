const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.onUnauthorized = null; // Set by auth context
  }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401 && options._retried !== true) {
      // Try token refresh
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request(path, { ...options, _retried: true });
      }
      this.onUnauthorized?.();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `Request failed: ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return res.json();
  }

  async tryRefreshToken() {
    if (!this.refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  // Auth
  register(data) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  logout() {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
  }

  // Users
  getMe() {
    return this.request('/users/me');
  }

  updateProfile(data) {
    return this.request('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  searchUsers(query) {
    return this.request(`/users/search?q=${encodeURIComponent(query)}`);
  }

  getUser(id) {
    return this.request(`/users/${id}`);
  }

  // Chats
  getChats(page = 1) {
    return this.request(`/chats?page=${page}`);
  }

  createChat(data) {
    return this.request('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getMessages(chatId, before) {
    const params = before ? `?before=${before}&limit=50` : '?limit=50';
    return this.request(`/chats/${chatId}/messages${params}`);
  }

  markAsRead(chatId) {
    return this.request(`/chats/${chatId}/read`, { method: 'POST' });
  }

  getUnreadCounts() {
    return this.request('/chats/unread');
  }

  // Media
  getUploadUrl(chatId, fileName, mimeType, fileSize) {
    return this.request('/media/upload-url', {
      method: 'POST',
      body: JSON.stringify({ chatId, fileName, mimeType, fileSize }),
    });
  }
}

export const api = new ApiClient();
export default api;
