import { store } from '../state.js';

export function renderDashboardView(container) {
  const stats = store.get('stats');
  const lan = store.get('lanInfo');

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-group">
        <h1>📊 Tableau de Bord</h1>
        <p>Suivi en direct des présences — Journée d'Information & Journée du Test</p>
      </div>
      <div class="view-actions">
        <button class="btn btn-secondary" id="dash-btn-import">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Importer Excel
        </button>
        <button class="btn btn-primary" id="dash-btn-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          Recherche & Pointage
        </button>
      </div>
    </div>
    <!-- Active Session Banner -->
    <div style="margin-bottom: 20px; padding: 14px 20px; background: var(--bg-card); border-radius: 12px; border: 1.5px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;" id="dash-session-banner">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 1.6rem;" id="dash-session-icon">${(store.get('activeSession') === 'test') ? '📝' : '📢'}</span>
        <div>
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
            Séance de pointage actuellement ouverte
          </div>
          <div style="font-size: 1.1rem; font-weight: 800; color: ${(store.get('activeSession') === 'test') ? 'var(--color-success)' : 'var(--color-primary)'};" id="dash-session-title">
            ${(store.get('activeSession') === 'test') ? 'Journée de test' : "Journée d'information"}
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="dash-btn-switch-search">
        Aller pointer dans cette journée →
      </button>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">

      <div class="kpi-card kpi-total">
        <div class="kpi-header">
          <div class="kpi-title">👥 Total inscrits</div>
          <div class="kpi-icon-wrap">👥</div>
        </div>
        <div class="kpi-value">${stats.total.toLocaleString('fr-FR')}</div>
        <div class="kpi-footer">Personnes dans la base de données</div>
      </div>

      <div class="kpi-card kpi-info" style="border-top: 3px solid var(--color-primary);">
        <div class="kpi-header">
          <div class="kpi-title" style="color:var(--color-primary);">📢 Journée Info</div>
          <div class="kpi-icon-wrap" style="background:var(--color-primary-light);">📢</div>
        </div>
        <div class="kpi-value" style="color:var(--color-primary);">
          ${stats.presentInfo.toLocaleString('fr-FR')}
          <span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;">/ ${stats.total}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${stats.rateInfo}%; background: var(--color-primary);"></div>
        </div>
        <div class="kpi-footer" style="margin-top:8px;">
          Taux : <strong>${stats.rateInfo}%</strong> — ${stats.absentInfo} absent(s)
        </div>
      </div>

      <div class="kpi-card kpi-test" style="border-top: 3px solid var(--color-success);">
        <div class="kpi-header">
          <div class="kpi-title" style="color:var(--color-success);">📝 Journée Test</div>
          <div class="kpi-icon-wrap" style="background:var(--color-success-light);">📝</div>
        </div>
        <div class="kpi-value" style="color:var(--color-success);">
          ${stats.presentTest.toLocaleString('fr-FR')}
          <span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;">/ ${stats.total}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${stats.rateTest}%; background: var(--color-success);"></div>
        </div>
        <div class="kpi-footer" style="margin-top:8px;">
          Taux : <strong>${stats.rateTest}%</strong> — ${stats.absentTest} absent(s)
        </div>
      </div>

      <div class="kpi-card kpi-both" style="border-top: 3px solid var(--color-purple);">
        <div class="kpi-header">
          <div class="kpi-title" style="color:var(--color-purple);">⭐ Présents aux 2</div>
          <div class="kpi-icon-wrap" style="background:var(--color-purple-light);">⭐</div>
        </div>
        <div class="kpi-value" style="color:var(--color-purple);">
          ${stats.presentBoth.toLocaleString('fr-FR')}
        </div>
        <div class="kpi-footer">Assiduité complète (Info + Test)</div>
      </div>

    </div>

    <!-- Detailed breakdown + LAN -->
    <div class="dashboard-detail-grid">

      <!-- Breakdown -->
      <div class="kpi-card" style="padding: 20px;">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 16px; display:flex; align-items:center; gap:8px;">
          📊 Répartition détaillée
        </h3>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.86rem;">
          <div style="display: flex; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">⭐ Présents aux deux séances</span>
            <strong style="color: var(--color-purple);">${stats.presentBoth}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">📢 Seulement à l'Information</span>
            <strong style="color: var(--color-primary);">${stats.presentOnlyInfo}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">📝 Seulement au Test</span>
            <strong style="color: var(--color-success);">${stats.presentOnlyTest}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">❌ Absents aux deux séances</span>
            <strong style="color: var(--color-danger);">${stats.absentBoth}</strong>
          </div>
        </div>
      </div>

      <!-- LAN Card -->
      <div class="kpi-card" style="padding: 20px; background: linear-gradient(135deg, rgba(79,142,247,0.07), rgba(34,211,160,0.05)); border-color: rgba(79,142,247,0.2);">
        <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
          🌐 Réseau Local (LAN)
        </h3>
        <p style="font-size: 0.83rem; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.6;">
          Partagez cette adresse avec les autres postes pour pointer en simultané :
        </p>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" readonly class="filter-input"
            style="flex: 1; font-family: var(--font-mono); font-weight: 600; color: var(--color-primary); font-size: 0.9rem;"
            value="${lan.lanUrl || 'http://localhost:3000'}" id="dash-lan-input">
          <button class="btn btn-secondary btn-sm" id="dash-btn-copy-lan">Copier</button>
        </div>
        <div style="margin-top: 12px; font-size: 0.78rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
          <span class="lan-pulse online"></span>
          <span>Postes connectés : <strong>${lan.activeClients || 1}</strong></span>
        </div>
      </div>

    </div>
  `;

  container.querySelector('#dash-btn-import')?.addEventListener('click', () => window.app.navigate('import'));
  container.querySelector('#dash-btn-search')?.addEventListener('click', () => window.app.navigate('search'));
  container.querySelector('#dash-btn-switch-search')?.addEventListener('click', () => window.app.navigate('search'));

  container.querySelector('#dash-btn-copy-lan')?.addEventListener('click', () => {
    const input = container.querySelector('#dash-lan-input');
    if (input) {
      navigator.clipboard.writeText(input.value).then(() => {
        window.app?.showToast('Adresse réseau copiée !', 'info');
      }).catch(() => {
        window.app?.showToast('Impossible de copier (HTTPS requis)', 'warning');
      });
    }
  });

  return {
    onSessionChanged(activeDay, label) {
      const isTest = activeDay === 'test';
      const iconEl = container.querySelector('#dash-session-icon');
      const titleEl = container.querySelector('#dash-session-title');
      if (iconEl) iconEl.textContent = isTest ? '📝' : '📢';
      if (titleEl) {
        titleEl.textContent = label || (isTest ? 'Journée de test' : "Journée d'information");
        titleEl.style.color = isTest ? 'var(--color-success)' : 'var(--color-primary)';
      }
    }
  };
}
