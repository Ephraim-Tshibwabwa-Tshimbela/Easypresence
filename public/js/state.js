// Global Reactive State Store
class Store {
  constructor() {
    this.subscribers = new Map();
    this.state = {
      currentView: 'dashboard',
      stats: {
        total: 0,
        presentInfo: 0,
        absentInfo: 0,
        rateInfo: 0,
        presentTest: 0,
        absentTest: 0,
        rateTest: 0,
        presentBoth: 0,
        presentOnlyInfo: 0,
        presentOnlyTest: 0,
        absentBoth: 0,
        totalMen: 0,
        totalWomen: 0,
        presentInfoMen: 0,
        presentInfoWomen: 0,
        presentTestMen: 0,
        presentTestWomen: 0,
        // Legacy fallbacks
        present: 0,
        absent: 0,
        rate: 0,
        lastActivity: null,
        activeClients: 1
      },
      activeSession: localStorage.getItem('active_session') || 'info', // 'info' or 'test'
      agentName: localStorage.getItem('agent_name') || 'Poste 01',
      theme: localStorage.getItem('app_theme') || 'dark',
      soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
      lanInfo: {
        primaryIp: '127.0.0.1',
        port: 3000,
        lanUrl: 'http://localhost:3000',
        activeClients: 1
      },
      isOnline: true,
      // Role: determined at runtime by calling /api/auth/role
      // 'admin' = host machine (full access), 'client' = remote machine (limited access)
      role: 'client',
      isAdmin: false,
      // Server-registered workstation name for this machine (client only)
      workstationName: localStorage.getItem('workstation_name') || null
    };
  }

  /** Called once on startup with the server-determined role. */
  setRole(role) {
    const safe = role === 'admin' ? 'admin' : 'client';
    this.set('role', safe);
    this.set('isAdmin', safe === 'admin');
  }

  /** Persists the workstation name locally and in state. */
  setWorkstationName(name) {
    const safe = (name || '').trim();
    localStorage.setItem('workstation_name', safe);
    this.set('workstationName', safe);
    // Also keep agentName in sync so it appears in presence logs
    this.setAgentName(safe || this.state.agentName);
  }

  setActiveSession(sessionType, label = null) {
    const safe = sessionType === 'test' ? 'test' : 'info';
    const safeLabel = label || (safe === 'test' ? 'Journée de test' : "Journée d'information");
    localStorage.setItem('active_session', safe);
    this.set('activeSession', safe);
    this.set('activeSessionLabel', safeLabel);
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
    this.emit(key, value);
    this.emit('*', { key, value, state: this.state });
  }

  updateStats(newStats) {
    this.state.stats = { ...this.state.stats, ...newStats };
    this.emit('stats', this.state.stats);
    this.emit('*', { key: 'stats', value: this.state.stats, state: this.state });
  }

  setAgentName(name) {
    const safe = (name || 'Poste').trim();
    localStorage.setItem('agent_name', safe);
    this.set('agentName', safe);
  }

  setTheme(theme) {
    localStorage.setItem('app_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.set('theme', theme);
  }

  on(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);
    return () => this.subscribers.get(event).delete(callback);
  }

  emit(event, payload) {
    if (this.subscribers.has(event)) {
      for (const cb of this.subscribers.get(event)) {
        try {
          cb(payload);
        } catch (e) {
          console.error(`Error in state subscriber for ${event}:`, e);
        }
      }
    }
  }
}

export const store = new Store();
