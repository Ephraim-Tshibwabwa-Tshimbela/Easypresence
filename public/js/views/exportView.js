import { store } from '../state.js';

export function renderExportView(container) {
  const stats = store.get('stats') || {
    total: 0,
    presentInfo: 0,
    rateInfo: 0,
    absentInfo: 0,
    presentTest: 0,
    rateTest: 0,
    absentTest: 0,
    presentBoth: 0
  };

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-group">
        <h1>
          <span>Rapports & Exportations par Journée</span>
        </h1>
        <p>Exportez facilement les résultats de présence pour chaque journée (Info ou Test) ou la synthèse globale</p>
      </div>
    </div>

    <!-- Export Grid (3 Cards: Info, Test, Global) -->
    <div class="export-cards-grid">
      
      <!-- Card 1: Journée d'Information -->
      <div class="kpi-card" style="padding: 24px; border-top: 4px solid var(--color-primary);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background: rgba(59, 130, 246, 0.15); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
              📢
            </div>
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main);">Journée d'Information</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary);">Résultats de la 1ère séance</p>
            </div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); background: rgba(59,130,246,0.15); color: var(--color-primary);">
            ${stats.rateInfo}% participation
          </span>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md); margin-bottom: 18px; font-size: 0.85rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: var(--text-secondary);">Présents émargés :</span>
            <strong style="color: var(--color-primary);">${stats.presentInfo} personnes</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Absents :</span>
            <strong style="color: var(--color-danger);">${stats.absentInfo} personnes</strong>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
          <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary);">Filtre d'exportation :</label>
          <select id="export-info-filter" class="filter-select" style="width: 100%;">
            <option value="present_info" selected>🟢 Uniquement les Présents Info (${stats.presentInfo})</option>
            <option value="all">📋 Tous les inscrits avec statut Info (${stats.total})</option>
            <option value="absent_info">⚪ Absents Journée Info (${stats.absentInfo})</option>
          </select>
        </div>

        <div style="display: flex; gap: 10px; flex-direction: column;">
          <button class="btn btn-success" id="btn-export-info-excel" style="width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Télécharger Excel — Journée Info (.xlsx)
          </button>
          <button class="btn btn-primary" id="btn-export-info-pdf" style="width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Télécharger PDF — Fiche Info (.pdf)
          </button>
        </div>
      </div>

      <!-- Card 2: Journée du Test -->
      <div class="kpi-card" style="padding: 24px; border-top: 4px solid var(--color-success);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background: rgba(16, 185, 129, 0.15); color: var(--color-success); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
              📝
            </div>
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main);">Journée du Test</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary);">Résultats de la 2nde séance</p>
            </div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); background: rgba(16,185,129,0.15); color: var(--color-success);">
            ${stats.rateTest}% participation
          </span>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md); margin-bottom: 18px; font-size: 0.85rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: var(--text-secondary);">Présents émargés :</span>
            <strong style="color: var(--color-success);">${stats.presentTest} personnes</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Absents :</span>
            <strong style="color: var(--color-danger);">${stats.absentTest} personnes</strong>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
          <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary);">Filtre d'exportation :</label>
          <select id="export-test-filter" class="filter-select" style="width: 100%;">
            <option value="present_test" selected>🟢 Uniquement les Présents Test (${stats.presentTest})</option>
            <option value="all">📋 Tous les inscrits avec statut Test (${stats.total})</option>
            <option value="absent_test">⚪ Absents Journée Test (${stats.absentTest})</option>
          </select>
        </div>

        <div style="display: flex; gap: 10px; flex-direction: column;">
          <button class="btn btn-success" id="btn-export-test-excel" style="width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Télécharger Excel — Journée Test (.xlsx)
          </button>
          <button class="btn btn-primary" id="btn-export-test-pdf" style="width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Télécharger PDF — Fiche Test (.pdf)
          </button>
        </div>
      </div>

      <!-- Card 3: Rapport Global (Double Séance) -->
      <div class="kpi-card" style="padding: 24px; border-top: 4px solid var(--color-purple);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background: rgba(168, 85, 247, 0.15); color: var(--color-purple); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
              ⭐
            </div>
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main);">Synthèse des 2 Séances</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary);">Rapport comparatif complet</p>
            </div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); background: rgba(168,85,247,0.15); color: var(--color-purple);">
            ${stats.presentBoth} aux 2 séances
          </span>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md); margin-bottom: 18px; font-size: 0.85rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: var(--text-secondary);">Total inscrits :</span>
            <strong>${stats.total} personnes</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Présents aux 2 séances :</span>
            <strong style="color: var(--color-purple);">${stats.presentBoth} personnes</strong>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
          <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary);">Filtre d'exportation :</label>
          <select id="export-global-filter" class="filter-select" style="width: 100%;">
            <option value="all" selected>📋 Toutes les personnes (${stats.total} inscrits)</option>
            <option value="present_both">⭐ Uniquement présents aux DEUX séances (${stats.presentBoth})</option>
          </select>
        </div>

        <div style="display: flex; gap: 10px; flex-direction: column;">
          <button class="btn btn-secondary" id="btn-export-global-excel" style="width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Télécharger Excel Comparatif (2 séances)
          </button>
          <button class="btn btn-secondary" id="btn-export-global-pdf" style="width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Télécharger PDF Comparatif (2 séances)
          </button>
        </div>
      </div>

    </div>
  `;

  // --- Handlers Journée Info ---
  container.querySelector('#btn-export-info-excel')?.addEventListener('click', () => {
    const filter = container.querySelector('#export-info-filter').value;
    window.location.href = `/api/export/excel?filter=${encodeURIComponent(filter)}&session=info`;
    window.app.showToast('Génération du fichier Excel pour la Journée d\'Information...', 'info');
  });

  container.querySelector('#btn-export-info-pdf')?.addEventListener('click', () => {
    const filter = container.querySelector('#export-info-filter').value;
    const title = encodeURIComponent('LISTE DES PRÉSENCES — JOURNÉE D\'INFORMATION');
    window.location.href = `/api/export/pdf?filter=${encodeURIComponent(filter)}&session=info&title=${title}`;
    window.app.showToast('Génération de la fiche PDF pour la Journée d\'Information...', 'info');
  });

  // --- Handlers Journée Test ---
  container.querySelector('#btn-export-test-excel')?.addEventListener('click', () => {
    const filter = container.querySelector('#export-test-filter').value;
    window.location.href = `/api/export/excel?filter=${encodeURIComponent(filter)}&session=test`;
    window.app.showToast('Génération du fichier Excel pour la Journée du Test...', 'info');
  });

  container.querySelector('#btn-export-test-pdf')?.addEventListener('click', () => {
    const filter = container.querySelector('#export-test-filter').value;
    const title = encodeURIComponent('LISTE DES PRÉSENCES — JOURNÉE DU TEST');
    window.location.href = `/api/export/pdf?filter=${encodeURIComponent(filter)}&session=test&title=${title}`;
    window.app.showToast('Génération de la fiche PDF pour la Journée du Test...', 'info');
  });

  // --- Handlers Global ---
  container.querySelector('#btn-export-global-excel')?.addEventListener('click', () => {
    const filter = container.querySelector('#export-global-filter').value;
    window.location.href = `/api/export/excel?filter=${encodeURIComponent(filter)}&session=both`;
    window.app.showToast('Génération du classeur Excel comparatif...', 'info');
  });

  container.querySelector('#btn-export-global-pdf')?.addEventListener('click', () => {
    const filter = container.querySelector('#export-global-filter').value;
    const title = encodeURIComponent('LISTE DE PRÉSENCE COMPARATIVE — INFO ET TEST');
    window.location.href = `/api/export/pdf?filter=${encodeURIComponent(filter)}&session=both&title=${title}`;
    window.app.showToast('Génération du rapport PDF comparatif...', 'info');
  });
}
