import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

/**
 * Format ISO string into a human-readable "HH:MM:SS" or "DD/MM HH:MM"
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
    return formatTimeOnly(iso);
  } catch (_) {
    return formatTimeOnly(iso);
  }
}

/**
 * Renders the Admin "Postes connectés" view.
 */
export function renderPostesView(container) {
  if (!store.get('isAdmin')) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:20px;text-align:center;">
        <div style="font-size:3.5rem;">🔒</div>
        <h2 style="font-size:1.5rem;font-weight:700;color:var(--text-main);">Accès Administrateur Requis</h2>
        <p style="color:var(--text-muted);max-width:420px;">
          Cette section est strictement réservée à la machine hôte pour superviser les postes connectés en temps réel.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="postes-page">
      <!-- Header -->
      <div class="view-header">
        <div class="view-title-group">
          <h1>🖥️ Postes connectés</h1>
          <p>Supervisez en temps réel les postes actifs et l'état des connexions réseau</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div class="postes-live-chip" id="postes-live-summary">
            <span class="live-pulse"></span>
            <span id="postes-online-count">0</span> poste(s) connecté(s) en direct
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

      <!-- Main Content Card -->
      <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-color); border-radius:12px;">
        <div class="table-responsive">
          <table class="postes-table" style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="background:var(--bg-card-header); border-bottom:1px solid var(--border-color);">
                <th style="padding:14px 18px; font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Poste</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Statut</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Adresse IP</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Connexion</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Dernière activité</th>
                <th style="padding:14px 18px; font-weight:700; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Rôle</th>
              </tr>
            </thead>
            <tbody id="postes-tbody">
              <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:var(--text-muted);">
                  <div class="postes-spinner" style="margin:0 auto 10px;"></div>
                  Chargement des postes connectés...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Live Info Banner -->
      <div style="margin-top:16px; padding:12px 18px; background:var(--bg-card); border-radius:10px; border:1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div style="font-size:0.85rem; color:var(--text-muted);">
          ℹ️ Cette liste se synchronise automatiquement dès qu'un poste se connecte, effectue une recherche ou valide un pointage.
        </div>
        <div style="font-size:0.8rem; font-family:var(--font-mono); color:var(--text-muted);" id="postes-last-sync">
          Dernière synchro : --
        </div>
      </div>
    </div>
  `;

  const tbody = container.querySelector('#postes-tbody');
  const countEl = container.querySelector('#postes-online-count');
  const syncEl = container.querySelector('#postes-last-sync');

  let currentClients = [];

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
            <td colspan="6" style="padding:24px; text-align:center; color:var(--color-danger);">
              Erreur lors du chargement des postes : ${err.message}
            </td>
          </tr>`;
      }
    }
  }

  function renderTable() {
    if (!tbody) return;

    const onlineCount = currentClients.filter(c => c.isOnline).length;
    if (countEl) countEl.textContent = onlineCount;

    if (currentClients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:2rem; margin-bottom:8px;">💻</div>
            <strong>Aucun poste détecté pour le moment</strong>
            <p style="font-size:0.85rem; margin-top:4px;">Les postes connectés apparaîtront automatiquement ici.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = currentClients.map(c => {
      const isOnline = Boolean(c.isOnline);
      const isAdmin = c.role === 'ADMIN';

      const statusBadge = isOnline
        ? `<span class="poste-status-pill online"><span class="dot"></span> 🟢 Connecté</span>`
        : `<span class="poste-status-pill offline"><span class="dot"></span> 🔴 Déconnecté</span>`;

      const roleBadge = isAdmin
        ? `<span class="poste-role-pill admin">👑 ADMIN</span>`
        : `<span class="poste-role-pill client">💻 CLIENT</span>`;

      const hostTag = isAdmin ? `<span style="font-size:0.75rem; background:rgba(79,142,247,0.15); color:var(--color-primary); padding:2px 6px; border-radius:4px; font-weight:600; margin-left:6px;">Hôte</span>` : '';

      return `
        <tr style="border-bottom:1px solid var(--border-color); transition:background 0.2s ease;">
          <td style="padding:16px 18px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:8px; background:var(--bg-input); display:flex; align-items:center; justify-content:center; font-size:1.1rem;">
                ${isAdmin ? '👑' : '💻'}
              </div>
              <div>
                <div style="font-weight:700; color:var(--text-main); font-size:0.95rem; display:flex; align-items:center;">
                  ${escapeHtml(c.name || 'Poste')}
                  ${hostTag}
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                  ${isOnline ? 'Session active' : 'Session fermée'}
                </div>
              </div>
            </div>
          </td>
          <td style="padding:16px 18px;">
            ${statusBadge}
          </td>
          <td style="padding:16px 18px; font-family:var(--font-mono); font-size:0.9rem; color:var(--text-main); font-weight:600;">
            ${escapeHtml(c.ip || '127.0.0.1')}
          </td>
          <td style="padding:16px 18px; font-size:0.85rem; color:var(--text-muted);">
            ${formatDateTime(c.connectedAt)}
          </td>
          <td style="padding:16px 18px;">
            <div style="font-weight:600; font-size:0.9rem; color:var(--text-main);">
              ${formatTimeOnly(c.lastActivity)}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
              ${timeAgo(c.lastActivity)}
            </div>
          </td>
          <td style="padding:16px 18px;">
            ${roleBadge}
          </td>
        </tr>
      `;
    }).join('');
  }


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