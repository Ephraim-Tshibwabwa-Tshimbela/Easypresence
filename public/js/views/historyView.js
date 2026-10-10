import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export function renderHistoryView(container) {
  let currentOffset = 0;
  const limit = 50;

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-group">
        <h1>
          <span>Journal d'Audit & Historique</span>
        </h1>
        <p>Traçabilité complète des pointages horodatés et des postes ayant effectué l'action</p>
      </div>

      <div class="view-actions">
        <button class="btn btn-secondary btn-sm" id="hist-btn-refresh">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
          </svg>
          Actualiser
        </button>
      </div>
    </div>

    <!-- History Table -->
    <div class="table-card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 170px;">Date & Heure</th>
              <th style="width: 90px;">SN</th>
              <th>Matricule</th>
              <th>Nom & Prénoms</th>
              <th>Action / Statut</th>
              <th>Poste / Agent</th>
              <th>Adresse IP</th>
            </tr>
          </thead>
          <tbody id="hist-tbody">
            <tr>
              <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
                Chargement de l'historique...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination-bar">
        <div id="hist-count-badge">0 événement(s) enregistré(s)</div>
        <div class="pagination-controls">
          <button class="btn btn-secondary btn-sm" id="hist-btn-prev" disabled>Précédent</button>
          <button class="btn btn-secondary btn-sm" id="hist-btn-next" disabled>Suivant</button>
        </div>
      </div>
    </div>
  `;

  const tbody = container.querySelector('#hist-tbody');
  const countBadge = container.querySelector('#hist-count-badge');
  const btnPrev = container.querySelector('#hist-btn-prev');
  const btnNext = container.querySelector('#hist-btn-next');

  async function loadHistory() {
    try {
      const res = await api.fetchHistory(limit, currentOffset);
      const rows = res.rows || [];
      const total = res.total || 0;

      countBadge.textContent = `${total} événement(s) au total`;
      btnPrev.disabled = currentOffset <= 0;
      btnNext.disabled = currentOffset + limit >= total;

      if (rows.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 48px; color: var(--text-muted);">
              Aucun historique de présence pour le moment.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const isPresent = r.status === 'present';
        const isReset = r.status === 'reset';

        return `
          <tr>
            <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">
              ${escapeHtml(r.action_time)}
            </td>
            <td><strong style="color: var(--color-primary); font-family: var(--font-mono);">${escapeHtml(r.sn || '-')}</strong></td>
            <td><span class="person-matricule">${escapeHtml(r.matricule || '-')}</span></td>
            <td><strong>${escapeHtml(r.full_name)}</strong></td>
            <td>
              <span class="presence-status-badge ${isPresent ? 'present' : isReset ? 'absent' : 'absent'}">
                ${isPresent ? '🟢 Marqué Présent' : isReset ? '⚠️ Réinitialisation' : '⚪ Marqué Absent'}
              </span>
            </td>
            <td><strong>${escapeHtml(r.agent_name || 'Poste')}</strong></td>
            <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(r.ip_address || 'Local')}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 30px; color: var(--color-danger);">
            Erreur : ${err.message}
          </td>
        </tr>
      `;
    }
  }

  btnPrev?.addEventListener('click', () => {
    if (currentOffset >= limit) {
      currentOffset -= limit;
      loadHistory();
    }
  });

  btnNext?.addEventListener('click', () => {
    currentOffset += limit;
    loadHistory();
  });

  container.querySelector('#hist-btn-refresh')?.addEventListener('click', () => {
    loadHistory();
  });

  // WebSocket live sync
  const unbindWs = api.on('presence_updated', () => loadHistory());
  container._cleanup = () => unbindWs();

  loadHistory();
}
