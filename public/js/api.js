import { store } from './state.js';
import { soundManager } from './sound.js';

class ApiClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.listeners = new Map();
    this.initWebSocket();
    this.setupUnloadHandler();
  }

  getClientId() {
    let id = localStorage.getItem('easypresence_client_id');
    if (!id) {
      id = 'cl_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('easypresence_client_id', id);
    }
    return id;
  }

  getDeviceInfo() {
    const ua = navigator.userAgent || '';
    let os = 'Windows';
    let deviceType = 'desktop';

    if (/iPad|tablet|(android(?!.*mobile))/i.test(ua)) {
      deviceType = 'tablet';
    } else if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      deviceType = 'mobile';
    }

    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/iPhone/i.test(ua)) os = 'iPhone';
    else if (/iPad/i.test(ua)) os = 'iPad';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Linux/i.test(ua)) os = 'Linux';
    else if (/CrOS/i.test(ua)) os = 'ChromeOS';

    let browser = 'Navigateur';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';

    const icon = deviceType === 'mobile' ? '📱' : deviceType === 'tablet' ? '📱' : '💻';
    const label = `${icon} ${os} • ${browser}`;

    return { os, browser, deviceType, label };
  }

  setupUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({
            type: 'GOODBYE',
            clientId: this.getClientId()
          }));
        } catch (_) {}
      }
    });
  }

  sendIdentify() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const token = sessionStorage.getItem('easypresence_admin_token') || localStorage.getItem('easypresence_admin_token');
    const isAdmin = Boolean(store.get('isAdmin') || token);
    const clientName = store.get('workstationName') || store.get('agentName') || (isAdmin ? 'PC-Admin' : 'Poste Opérateur');

    try {
      this.ws.send(JSON.stringify({
        type: 'IDENTIFY',
        clientId: this.getClientId(),
        name: clientName,
        role: isAdmin ? 'ADMIN' : 'OPERATEUR',
        token: token || null,
        deviceInfo: this.getDeviceInfo()
      }));
    } catch (_) {}
  }

  // --- WebSocket Real-Time Sync ---
  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        store.set('isOnline', true);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Send identify message immediately upon connecting
        this.sendIdentify();

        // Start heartbeat keep-alive (every 20s)
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({
                type: 'PING',
                clientId: this.getClientId()
              }));
            } catch (_) {}
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleWsMessage(msg);
        } catch (_) {}
      };

      this.ws.onclose = () => {
        store.set('isOnline', false);
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        store.set('isOnline', false);
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        try { this.ws.close(); } catch (_) {}
      };
    } catch (_) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.initWebSocket();
      }, 3000);
    }
  }

  handleWsMessage(msg) {
    if (msg.type === 'CONNECTED') {
      if (msg.data?.activeDay) {
        store.setActiveSession(msg.data.activeDay, msg.data.activeDayLabel);
        this.emit('session_day_changed', { activeDay: msg.data.activeDay, label: msg.data.activeDayLabel, initial: true });
      }
      if (msg.data?.clientCount) {
        const lan = store.get('lanInfo');
        store.set('lanInfo', { ...lan, activeClients: msg.data.clientCount });
      }
    } else if (msg.type === 'CLIENT_COUNT') {
      const lan = store.get('lanInfo');
      store.set('lanInfo', { ...lan, activeClients: msg.data.count });
    } else if (msg.type === 'PRESENCE_UPDATED') {
      if (msg.data.stats) {
        store.updateStats(msg.data.stats);
      }
      this.emit('presence_updated', msg.data);
    } else if (msg.type === 'BULK_PRESENCE_UPDATED') {
      if (msg.data.stats) {
        store.updateStats(msg.data.stats);
      }
      this.emit('bulk_presence_updated', msg.data);
    } else if (msg.type === 'DATA_IMPORTED' || msg.type === 'DATA_RESET' || msg.type === 'DATA_CLEARED') {
      if (msg.data.stats) {
        store.updateStats(msg.data.stats);
      }
      this.emit('data_changed', msg);
    } else if (msg.type === 'WORKSTATION_UPDATED') {
      this.emit('workstation_updated', msg.data);
    } else if (msg.type === 'SESSION_DAY_CHANGED') {
      if (msg.data?.activeDay) {
        store.setActiveSession(msg.data.activeDay, msg.data.label);
      }
      this.emit('session_day_changed', msg.data);
    } else if (msg.type === 'CLIENTS_UPDATED') {
      this.emit('clients_updated', msg.data);
    }
  }

  on(event, cb) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event).delete(cb);
  }

  emit(event, payload) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try { cb(payload); } catch (e) { console.error(e); }
      }
    }
  }

  // --- Headers with Admin Token Authorization ---
  getHeaders(extra = {}) {
    const headers = {
      'Accept': 'application/json',
      'X-Client-Id': this.getClientId(),
      'X-Device-Info': encodeURIComponent(JSON.stringify(this.getDeviceInfo())),
      ...extra
    };
    const token = sessionStorage.getItem('easypresence_admin_token') || localStorage.getItem('easypresence_admin_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Admin-Token'] = token;
    }
    return headers;
  }

  // --- REST Requests ---
  async get(endpoint, params = {}) {
    const url = new URL(`/api${endpoint}`, window.location.origin);
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.append(key, val);
      }
    }

    const res = await fetch(url.toString(), {
      headers: this.getHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Erreur serveur (${res.status})`);
    }
    return json;
  }

  async post(endpoint, data = {}) {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Erreur serveur (${res.status})`);
    }
    return json;
  }

  // --- Specific API Methods ---
  async fetchStats() {
    const res = await this.get('/stats');
    store.updateStats(res.data);
    return res.data;
  }

  async searchPersons(q, limit = 50) {
    return this.get('/search', { q, limit });
  }

  async fetchPersons(params) {
    return this.get('/persons', params);
  }

  async togglePresence(id, sessionType = 'info', status = null) {
    const agentName = store.get('agentName');
    const res = await this.post('/presence/toggle', { id, sessionType, status, agentName });
    store.updateStats(res.data.stats);

    const isPresent = sessionType === 'test' 
      ? res.data.person.is_present_test === 1 
      : res.data.person.is_present_info === 1;

    if (isPresent) {
      soundManager.playSuccess();
    } else {
      soundManager.playCancel();
    }

    return res.data;
  }

  async bulkMarkPresence(ids, sessionType = 'info', isPresent = true) {
    const agentName = store.get('agentName');
    const res = await this.post('/presence/bulk', { ids, sessionType, isPresent, agentName });
    store.updateStats(res.data.stats);
    if (isPresent) soundManager.playSuccess();
    return res.data;
  }

  async resetAllAttendance(sessionType = 'all') {
    const agentName = store.get('agentName');
    const res = await this.post('/presence/reset', { sessionType, agentName });
    store.updateStats(res.stats);
    return res;
  }

  async uploadExcelPreview(file) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = this.getHeaders();
    delete headers['Content-Type'];

    const res = await fetch('/api/excel/preview', {
      method: 'POST',
      headers,
      body: formData
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Erreur lors de l\'analyse du fichier Excel.');
    }
    return json;
  }

  async confirmExcelImport(sessionId, mapping, updateDuplicates) {
    return this.post('/excel/confirm-import', { sessionId, mapping, updateDuplicates });
  }

  async fetchHistory(limit = 50, offset = 0) {
    const res = await this.get('/history', { limit, offset });
    return res.data;
  }

  async fetchNetworkInfo() {
    const res = await this.get('/system/network');
    store.set('lanInfo', res.data);
    return res.data;
  }

  async clearAllData() {
    const res = await this.post('/system/clear-all');
    store.updateStats(res.stats);
    return res;
  }

  async delete(endpoint) {
    const res = await fetch(`/api${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Erreur serveur (${res.status})`);
    }
    return json;
  }

  async fetchExcelFiles() {
    const res = await this.get('/excel/files');
    return res.data;
  }

  async deleteExcelFile(id) {
    const res = await this.delete(`/excel/files/${id}`);
    if (res.stats) store.updateStats(res.stats);
    return res;
  }

  // --- Role & Access ---

  /** Fetches the server-determined role for this machine. */
  async fetchRole() {
    const res = await this.get('/auth/role');
    store.setRole(res.data.role);
    return res.data;
  }

  // --- Workstation Name ---

  /** Fetches the server-stored workstation name for this machine. */
  async fetchWorkstationName() {
    const res = await this.get('/client/name');
    return res.data;
  }

  /** Saves the workstation name on the server and updates local state. */
  async saveWorkstationName(name) {
    const res = await this.post('/client/name', { name });
    store.setWorkstationName(res.data.name);
    return res.data;
  }

  /** Admin only: fetch the list of all registered workstations. */
  async fetchWorkstations() {
    const res = await this.get('/admin/workstations');
    return res.data;
  }

  /** Admin only: fetch real-time connected clients list. */
  async fetchConnectedClients() {
    const res = await this.get('/admin/clients');
    return res.data;
  }

  // --- Active Session Day (Centralized) ---

  /** Fetches current active session day from server. */
  async fetchActiveSessionDay() {
    const res = await this.get('/session/active');
    if (res.data?.activeDay) {
      store.setActiveSession(res.data.activeDay, res.data.label);
    }
    return res.data;
  }

  /** Admin only: updates the active session day on the server. */
  async setActiveSessionDay(activeDay) {
    const res = await this.post('/session/active', { activeDay });
    if (res.data?.activeDay) {
      store.setActiveSession(res.data.activeDay, res.data.label);
    }
    return res.data;
  }

  // --- Presence Confirmation & Duplicate Prevention ---

  /** Marks presence securely after user confirmation, verifying duplicates. */
  async confirmMarkPresence(id) {
    const agentName = store.get('agentName');
    const res = await this.post('/presence/confirm-mark', { id, agentName });
    if (res.data?.stats) {
      store.updateStats(res.data.stats);
    }
    if (res.success && !res.alreadyPresent) {
      soundManager.playSuccess();
    } else {
      soundManager.playCancel();
    }
    return res;
  }

  // --- Admin Authentication & System Operations ---

  async loginAdmin(password) {
    const res = await this.post('/auth/login', { password });
    if (res.token) {
      sessionStorage.setItem('easypresence_admin_token', res.token);
      localStorage.setItem('easypresence_admin_token', res.token);
      store.setRole('admin');
      store.set('isAdmin', true);
      this.sendIdentify();
      window.app?.applyRoleToUI(true);
    }
    return res;
  }

  async logoutAdmin() {
    try {
      await this.post('/auth/logout', {});
    } catch (_) {}
    sessionStorage.removeItem('easypresence_admin_token');
    localStorage.removeItem('easypresence_admin_token');
    store.setRole('client');
    store.set('isAdmin', false);
    this.sendIdentify();
    window.app?.applyRoleToUI(false);
  }

  async changePassword(currentPassword, newPassword) {
    return this.post('/auth/change-password', { currentPassword, newPassword });
  }

  async restoreBackup(file) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = this.getHeaders();
    delete headers['Content-Type'];

    const res = await fetch('/api/system/restore', {
      method: 'POST',
      headers,
      body: formData
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Erreur lors de la restauration (${res.status})`);
    }
    return json;
  }
}

export const api = new ApiClient();
