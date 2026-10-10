import { store } from './state.js';
import { api } from './api.js';
import { soundManager } from './sound.js';
import { renderDashboardView } from './views/dashboardView.js';
import { renderSearchView } from './views/searchView.js';
import { renderListView } from './views/listView.js';
import { renderImportView } from './views/importView.js';
import { renderHistoryView } from './views/historyView.js';
import { renderExportView } from './views/exportView.js';
import { renderSettingsView } from './views/settingsView.js';
import { renderPostesView } from './views/postesView.js';

// Views restricted to the admin/host machine or authenticated session
const ADMIN_ONLY_VIEWS = new Set(['import', 'history', 'export', 'postes']);

class App {
  constructor() {
    this.viewContainer = document.getElementById('view-container');
    this.currentViewName = null;
    this.activeCleanup = null;
    this.init();
  }

  async init() {
    // Apply saved theme
    const theme = store.get('theme');
    document.documentElement.setAttribute('data-theme', theme);

    // Apply saved agent name
    const agent = store.get('agentName');
    const agentEl = document.getElementById('display-agent-name');
    if (agentEl) agentEl.textContent = agent;

    // 1. Determine role BEFORE anything else
    let roleData = { role: 'client', isAdmin: false };
    try {
      roleData = await api.fetchRole();
    } catch (_) {
      // If /auth/role fails (offline?), stay as client - safe default
    }

    // 2. Restore workstation name from server for client machines
    if (!roleData.isAdmin) {
      try {
        const wn = await api.fetchWorkstationName();
        if (wn.name) {
          store.setWorkstationName(wn.name);
          if (agentEl) agentEl.textContent = wn.name;
        } else if (store.get('workstationName')) {
          await api.saveWorkstationName(store.get('workstationName')).catch(() => {});
        }
      } catch (_) {}
    }

    // 3. Apply role to the UI
    this.applyRoleToUI(roleData.isAdmin);

    // 4. Sidebar navigation
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (!store.get('isAdmin') && ADMIN_ONLY_VIEWS.has(view)) {
          this.showToast("Acces reserve a l'administrateur (machine hote).", 'warning');
          return;
        }
        this.navigate(view);
      });
    });

    // Theme toggle (sidebar)
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const next = store.get('theme') === 'dark' ? 'light' : 'dark';
      store.setTheme(next);
      this.showToast(`Mode ${next === 'dark' ? 'Sombre 🌙' : 'Clair ☀️'} active`, 'info');
    });

    // Sound toggle (sidebar)
    const soundBtn = document.getElementById('sound-toggle');
    soundBtn?.addEventListener('click', () => {
      const enabled = soundManager.toggle();
      store.set('soundEnabled', enabled);
      this.showToast(enabled ? 'Son active 🔔' : 'Son coupe 🔕', 'info');
    });

    // Mobile sidebar drawer — overlay + auto-close
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');

    // Create overlay element once
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    const openSidebar = () => {
      sidebar?.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent bg scroll
    };
    const closeSidebar = () => {
      sidebar?.classList.remove('open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    };
    const toggleSidebar = () => sidebar?.classList.contains('open') ? closeSidebar() : openSidebar();

    menuToggle?.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeSidebar);

    // Auto-close sidebar on nav item click (mobile & tablet)
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.innerWidth <= 1023) closeSidebar();
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar?.classList.contains('open')) closeSidebar();
    });

    // Close sidebar when resizing back to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1023) closeSidebar();
    }, { passive: true });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.navigate('search');
      } else if (!isTyping || e.key.startsWith('F')) {
        if (e.key === 'F2') { e.preventDefault(); this.navigate('search'); }
        else if (e.key === 'F3') { e.preventDefault(); this.navigate('list'); }
        else if (e.key === 'F4' && store.get('isAdmin')) { e.preventDefault(); this.navigate('import'); }
        else if (e.key === 'F5' && !e.ctrlKey && store.get('isAdmin')) { e.preventDefault(); this.navigate('export'); }
        else if (e.key === 'F6' && store.get('isAdmin')) { e.preventDefault(); this.navigate('settings'); }
      }
    });

    // LAN network info
    try {
      const net = await api.fetchNetworkInfo();
      if (net?.primaryIp && net?.port) {
        const el = document.getElementById('header-lan-ip');
        if (el) el.textContent = `${net.primaryIp}:${net.port}`;
      }
    } catch (_) {}

    // Fetch centralized active session day from host server
    try {
      const activeData = await api.fetchActiveSessionDay();
      if (activeData?.activeDay) {
        this.updateTopbarActiveDay(activeData.activeDay, activeData.label);
      }
    } catch (_) {}

    // Initial update of topbar active day
    this.updateTopbarActiveDay(store.get('activeSession'), store.get('activeSessionLabel'));

    // Listen to real-time session day changes made by Admin
    api.on('session_day_changed', (data) => {
      this.updateTopbarActiveDay(data.activeDay, data.label);
      if (!data.initial) {
        this.showToast(`📅 Journée active : ${data.label}`, 'info');
      }
      // Notify current view without tearing down DOM or clearing user search input
      if (this.currentViewInstance?.onSessionChanged) {
        this.currentViewInstance.onSessionChanged(data.activeDay, data.label);
      }
    });

    // Initial stats
    try {
      const stats = await api.fetchStats();
      this.updateTopbarStats(stats);
    } catch (_) {}

    // Subscribe to stats updates to keep topbar fresh
    store.on('stats', (s) => this.updateTopbarStats(s));

    // Start on Search view (always accessible)
    this.navigate('search');
  }

  updateTopbarActiveDay(activeDay, label) {
    const badge = document.getElementById('topbar-active-day');
    const labelEl = document.getElementById('topbar-active-day-label');
    if (!badge || !labelEl) return;
    const isTest = activeDay === 'test';
    const safeLabel = label || (isTest ? 'Journée de test' : "Journée d'information");
    badge.className = `topbar-active-day ${isTest ? 'test' : 'info'}`;
    badge.title = `Séance active de pointage : ${safeLabel}`;
    labelEl.textContent = safeLabel;
  }

  applyRoleToUI(isAdmin) {
    // Nav items that are strictly admin-only
    const adminNavIds = ['nav-import', 'nav-export', 'nav-postes'];
    adminNavIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isAdmin) {
        el.removeAttribute('data-admin-hidden');
        el.style.display = '';
      } else {
        el.setAttribute('data-admin-hidden', 'true');
        el.style.display = 'none';
      }
    });

    // Also hide history nav item for clients
    const historyNav = document.getElementById('nav-history');
    if (historyNav) historyNav.style.display = isAdmin ? '' : 'none';

    // Agent chip: add role badge
    const agentChip = document.getElementById('agent-chip');
    if (agentChip) {
      agentChip.querySelector('.role-badge')?.remove();
      const badge = document.createElement('span');
      badge.className = `role-badge ${isAdmin ? 'role-admin' : 'role-client'}`;
      badge.textContent = isAdmin ? 'ADMIN' : 'CLIENT';
      agentChip.appendChild(badge);
    }

    // Show/hide the client workstation rename widget in the sidebar footer
    const clientWidget = document.getElementById('client-rename-widget');
    if (clientWidget) {
      clientWidget.style.display = isAdmin ? 'none' : '';

      if (!isAdmin) {
        // Pre-fill input with saved name
        const input = document.getElementById('client-rename-input');
        if (input) {
          const saved = store.get('workstationName') || store.get('agentName') || '';
          input.value = saved;
        }

        // Save handler
        const saveWorkstation = async () => {
          const val = (input?.value || '').trim();
          if (!val) {
            this.showToast('Veuillez saisir un nom pour ce poste.', 'warning');
            return;
          }
          try {
            await api.saveWorkstationName(val);
            document.getElementById('display-agent-name').textContent = val;
            this.showToast(`Poste enregistre sous : "${val}"`, 'success');
          } catch (err) {
            this.showToast('Erreur lors de l\'enregistrement du nom.', 'error');
          }
        };

        document.getElementById('client-rename-save')?.addEventListener('click', saveWorkstation);
        input?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveWorkstation();
        });
      }
    }

    // Show admin indicator in topbar
    const adminBadgeEl = document.getElementById('topbar-admin-badge');
    if (adminBadgeEl) {
      adminBadgeEl.style.display = isAdmin ? '' : 'none';
    }
  }

  updateTopbarStats(s) {
    if (!s) return;
    const el = (id, val) => {
      const e = document.getElementById(id);
      if (e) e.textContent = val;
    };
    el('qs-total', s.total ?? 0);
    el('qs-info',  s.presentInfo ?? 0);
    el('qs-test',  s.presentTest ?? 0);
    el('nav-badge-info', s.presentInfo ?? 0);
    el('nav-badge-test', s.presentTest ?? 0);
  }

  navigate(viewName, modeParam = null) {
    // Guard: block admin-only views for client machines
    if (!store.get('isAdmin') && ADMIN_ONLY_VIEWS.has(viewName)) {
      this.showToast("Acces reserve a l'administrateur (machine hote).", 'warning');
      return;
    }

    if (this.activeCleanup) {
      try { this.activeCleanup(); } catch (_) {}
      this.activeCleanup = null;
    }

    this.currentViewName = viewName;
    store.set('currentView', viewName);

    // Update nav active state
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    // Close mobile sidebar
    document.getElementById('sidebar')?.classList.remove('open');

    // Clear & render
    this.viewContainer.innerHTML = '';

    this.currentViewInstance = null;

    switch (viewName) {
      case 'dashboard':      this.currentViewInstance = renderDashboardView(this.viewContainer); break;
      case 'search':         this.currentViewInstance = renderSearchView(this.viewContainer);    break;
      case 'list':           this.currentViewInstance = renderListView(this.viewContainer, modeParam || 'all'); break;
      case 'presences_info': this.currentViewInstance = renderListView(this.viewContainer, 'present_info'); break;
      case 'presences_test': this.currentViewInstance = renderListView(this.viewContainer, 'present_test'); break;
      case 'presences_both': this.currentViewInstance = renderListView(this.viewContainer, 'both'); break;
      case 'attendance':     this.currentViewInstance = renderListView(this.viewContainer, 'present_info'); break;
      case 'import':         this.currentViewInstance = renderImportView(this.viewContainer);   break;
      case 'history':        this.currentViewInstance = renderHistoryView(this.viewContainer);  break;
      case 'export':         this.currentViewInstance = renderExportView(this.viewContainer);   break;
      case 'settings':       this.currentViewInstance = renderSettingsView(this.viewContainer); break;
      case 'postes':         this.currentViewInstance = renderPostesView(this.viewContainer);   break;
      default:               this.currentViewInstance = renderSearchView(this.viewContainer);   break;
    }

    if (this.viewContainer._cleanup) {
      this.activeCleanup = this.viewContainer._cleanup;
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'ok';
    else if (type === 'warning') icon = '!';
    else if (type === 'error') icon = 'x';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(60px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

window.app = new App();
