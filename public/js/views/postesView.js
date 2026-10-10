import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

/**
 * Format ISO string into a human-readable "DD/MM HH:MM:SS"
 */
function formatDateTime(iso) {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}:${secs}`;
  } catch (_) {
    return '--';
  }
}

function formatTimeOnly(iso) {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--';
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
  } catch (_) {
    return '--';
  }
}

function timeAgo(iso) {
  if (!iso) return '--';
  try {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 5) return "À l'instant";
    if (diffSec < 60) return `Il y a ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    return formatDateTime(iso);
  } catch (_) {
    return formatTimeOnly(iso);
  }
}

/**
 * Renders the Admin "Utilisateurs & Postes connectés" view.
 */
export function renderPostesView(container) {
  if (!store.get('isAdmin')) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:20px;text-align:center;">
        <div style="font-size:3.5rem;">🔒</div>
        <h2 style="font-size:1.5rem;font-weight:700;color:var(--text-main);">Accès Administrateur Requis</h2>
        <p style="color:var(--text-muted);max-width:440px;">
          Cette section de supervision des connexions en ligne est strictement réservée aux comptes administrateurs authentifiés.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="postes-page">
      <!-- Header -->
      <div class="view-header">
        <div class="view-title-group">
          <h1>👥 Utilisateurs &amp; Postes Connectés</h1>
          <p>Supervisez en direct tous les utilisateurs connectés à l'application via Internet, Wi-Fi ou réseau mobile</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div class="postes-live-chip" id="postes-live-summary">
            <span class="live-pulse"></span>
            <span id="postes-online-count">0</span> utilisateur(s) en ligne
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-refresh-postes">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      <!-- Live KPI Cards -->
      <div class="kpi-grid" style="margin-bottom: 24px;">
        <div class="kpi-card" style="border-left: 4px solid var(--color-success);">
          <div class="kpi-label">🟢 En ligne en direct</div>
          <div class="kpi-value" id="kpi-online-users" style="color:var(--color-success);">0</div>
          <div class="kpi-sub">Connectés via Internet ou LAN</div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid var(--color-primary);">
          <div class="kpi-label">👑 Administrateurs</div>
          <div class="kpi-value" id="kpi-admin-users" style="color:var(--color-primary);">0</div>
          <div class="kpi-sub">Sessions avec privilèges élevés</div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid var(--color-accent, #6366f1);">
          <div class="kpi-label">💻 Postes Opérateurs</div>
          <div class="kpi-value" id="kpi-operator-users">0</div>
          <div class="kpi-sub">Pointage &amp; recherche actifs</div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid var(--text-muted);">
          <div class="kpi-label">⚪ Postes Récents Déconnectés</div>
          <div class="kpi-value" id="kpi-offline-users" style="color:var(--text-muted);">0</div>
          <div class="kpi-sub">Sessions inactives récentes</div>
        </div>
      </div>

      <!-- Filter Controls -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; gap:8px;">
          <button class="btn btn-sm btn-primary filter-tab active" data-filter="all">Tous (<span id="count-filter-all">0</span>)</button>
          <button class="btn btn-sm btn-secondary filter-tab" data-filter="online">🟢 En ligne (<span id="count-filter-online">0</span>)</button>
          <button class="btn btn-sm btn-secondary filter-tab" data-filter="admin">👑 Admins (<span id="count-filter-admin">0</span>)</button>
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted);" id="postes-last-sync">
          Dernière synchronisation : --
        </div>
      </div>

      <!-- Main Content Card -->
      <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-color); border-radius:12px;">
        <div class="table-responsive">
          <table class="postes-table" style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="background:var(--bg-card-header); border-bottom:1px solid var(--border-color);">
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Utilisateur / Poste</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Statut</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Rôle</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Appareil &amp; Navigateur</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Dernière Activité</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Connexion</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Adresse IP</th>
              </tr>
            </thead>
            <tbody id="postes-tbody">
              <tr>
                <td colspan="7" style="padding:30px; text-align:center; color:var(--text-muted);">
                  <div class="postes-spinner" style="margin:0 auto 10px;"></div>
                  Chargement des utilisateurs connectés...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Network Notice Banner -->
      <div style="margin-top:16px; padding:12px 18px; background:var(--bg-card); border-radius:10px; border:1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div style="font-size:0.85rem; color:var(--text-muted);">
          🌐 <strong>Suivi multi-réseaux actif :</strong> Les statuts sont synchronisés en temps réel par heartbeat WebSocket. Fonctionne à travers Internet, routeurs 4G/5G, Wi-Fi et réseaux d'entreprise sans configuration particulière.
        </div>
      </div>
    </div>
  `;

  const tbody = container.querySelector('#postes-tbody');
  const countEl = container.querySelector('#postes-online-count');
  const syncEl = container.querySelector('#postes-last-sync');

  const kpiOnline = container.querySelector('#kpi-online-users');
  const kpiAdmin = container.querySelector('#kpi-admin-users');
  const kpiOperator = container.querySelector('#kpi-operator-users');
  const kpiOffline = container.querySelector('#kpi-offline-users');

  const countAll = container.querySelector('#count-filter-all');
  const countOnline = container.querySelector('#count-filter-online');
  const countAdmin = container.querySelector('#count-filter-admin');

  let currentClients = [];
  let activeFilter = 'all';

  async function loadClients() {
    try {
      const clients = await api.fetchConnectedClients();
      currentClients = Array.isArray(clients) ? clients : [];
      renderTable();
      if (syncEl) {
        syncEl.textContent = `Dernière synchro : ${new Date().toLocaleTimeString('fr-FR')}`;
      }
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding:24px; text-align:center; color:var(--color-danger);">
              Erreur lors du chargement des utilisateurs : ${err.message}
            </td>
          </tr>`;
      }
    }
  }

  function updateKpis() {
    const total = currentClients.length;
    const online = currentClients.filter(c => c.isOnline).length;
    const offline = total - online;
    const admins = currentClients.filter(c => c.role === 'ADMIN').length;
    const operators = currentClients.filter(c => c.role !== 'ADMIN').length;

    if (countEl) countEl.textContent = online;
    if (kpiOnline) kpiOnline.textContent = online;
    if (kpiAdmin) kpiAdmin.textContent = admins;
    if (kpiOperator) kpiOperator.textContent = operators;
    if (kpiOffline) kpiOffline.textContent = offline;

    if (countAll) countAll.textContent = total;
    if (countOnline) countOnline.textContent = online;
    if (countAdmin) countAdmin.textContent = admins;
  }

  function renderTable() {
    if (!tbody) return;
    updateKpis();

    let filtered = currentClients;
    if (activeFilter === 'online') {
      filtered = currentClients.filter(c => c.isOnline);
    } else if (activeFilter === 'admin') {
      filtered = currentClients.filter(c => c.role === 'ADMIN');
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:2rem; margin-bottom:8px;">👥</div>
            <strong>Aucun utilisateur correspondant à ce filtre</strong>
            <p style="font-size:0.85rem; margin-top:4px;">Les connexions actives apparaîtront automatiquement dès qu'un utilisateur se connecte.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const isOnline = Boolean(c.isOnline);
      const isAdmin = c.role === 'ADMIN';

      const statusBadge = isOnline
        ? `<span class="poste-status-pill online"><span class="dot"></span> En ligne</span>`
        : `<span class="poste-status-pill offline"><span class="dot"></span> Hors ligne</span>`;

      const roleBadge = isAdmin
        ? `<span class="poste-role-pill admin">👑 ADMINISTRATEUR</span>`
        : `<span class="poste-role-pill client">👤 OPÉRATEUR</span>`;

      const deviceLabel = escapeHtml(c.deviceLabel || (c.deviceType === 'mobile' ? '📱 Mobile' : '💻 Ordinateur'));

      const avatarIcon = isAdmin ? '👑' : (c.deviceType === 'mobile' ? '📱' : '💻');

      return `
        <tr style="border-bottom:1px solid var(--border-color); transition:background 0.2s ease;">
          <!-- Nom / Utilisateur -->
          <td style="padding:16px 18px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:40px; height:40px; border-radius:10px; background:var(--bg-input); display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0;">
                ${avatarIcon}
              </div>
              <div>
                <div style="font-weight:700; color:var(--text-main); font-size:0.95rem; display:flex; align-items:center; gap:6px;">
                  ${escapeHtml(c.name || (isAdmin ? 'PC-Admin' : 'Poste Opérateur'))}
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono); margin-top:2px;">
                  ID: ${escapeHtml((c.clientId || c.id || '').substring(0, 16))}
                </div>
              </div>
            </div>
          </td>

          <!-- Statut -->
          <td style="padding:16px 18px;">
            ${statusBadge}
          </td>

          <!-- Rôle -->
          <td style="padding:16px 18px;">
            ${roleBadge}
          </td>

          <!-- Appareil & Navigateur -->
          <td style="padding:16px 18px; font-size:0.88rem; color:var(--text-main);">
            <div style="font-weight:600;">${deviceLabel}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:capitalize;">
              ${escapeHtml(c.deviceType || 'Ordinateur')}
            </div>
          </td>

          <!-- Dernière Activité -->
          <td style="padding:16px 18px;">
            <div style="font-weight:600; font-size:0.9rem; color:var(--text-main);">
              ${formatTimeOnly(c.lastActivity)}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
              ${timeAgo(c.lastActivity)}
            </div>
          </td>

          <!-- Première Connexion -->
          <td style="padding:16px 18px; font-size:0.85rem; color:var(--text-muted);">
            ${formatDateTime(c.connectedAt)}
          </td>

          <!-- IP -->
          <td style="padding:16px 18px; font-family:var(--font-mono); font-size:0.88rem; color:var(--text-main); font-weight:600;">
            ${escapeHtml(c.ip || '127.0.0.1')}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Filter tabs listeners
  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary', 'active');
      activeFilter = btn.getAttribute('data-filter');
      renderTable();
    });
  });

  // Initial load
  loadClients();

  // Refresh button
  container.querySelector('#btn-refresh-postes')?.addEventListener('click', loadClients);

  // Auto-refresh via WebSocket
  const unbind1 = api.on('clients_updated', (data) => {
    if (data?.clients) {
      currentClients = data.clients;
      renderTable();
    } else {
      loadClients();
    }
  });

  const unbind2 = api.on('workstation_updated', () => loadClients());

  // Polling backup every 5 seconds while on this view
  const timer = setInterval(loadClients, 5000);

  container._cleanup = () => {
    unbind1();
    unbind2();
    clearInterval(timer);
  };
}