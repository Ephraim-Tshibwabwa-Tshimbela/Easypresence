import { store } from '../state.js';
import { api } from '../api.js';

export function renderExportView(container) {
  const getAdminToken = () => {
    return sessionStorage.getItem('easypresence_admin_token') || localStorage.getItem('easypresence_admin_token') || '';
  };

  const isActuallyAdmin = Boolean(store.get('isAdmin') || getAdminToken());

  // If not authenticated as Admin, display clean unlock card
  if (!isActuallyAdmin) {
    container.innerHTML = `
      <div class="view-header">
        <div class="view-title-group">
          <h1>📊 Rapports &amp; Exportations</h1>
          <p>Exportez facilement les résultats de présence pour chaque journée (Info ou Test) ou la synthèse globale</p>
        </div>
      </div>

      <div style="max-width: 520px; margin: 40px auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; padding: 32px; text-align: center; box-shadow: var(--shadow-md);">
        <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
        <h2 style="font-size: 1.35rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
          Session Administrateur Requise
        </h2>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 24px; line-height: 1.5;">
          Le téléchargement des listes de présence et des rapports certifiés (Excel / PDF) est une fonction réservée aux administrateurs.
        </p>

        <form id="export-unlock-form" style="display: flex; flex-direction: column; gap: 14px; text-align: left;">
          <div>
            <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">
              Mot de passe administrateur :
            </label>
            <input 
              type="password" 
              id="export-admin-pwd" 
              class="filter-input" 
              style="width: 100%; font-size: 0.95rem; padding: 12px 14px;" 
              placeholder="Saisissez votre mot de passe (ex: admin2026)" 
              required 
              autocomplete="current-password"
            />
          </div>
          <div id="export-unlock-error" style="color: var(--color-danger); font-size: 0.85rem; display: none;"></div>
          <button type="submit" class="btn btn-primary btn-lg" id="btn-export-unlock" style="width: 100%; justify-content: center; margin-top: 4px;">
            🔓 Déverrouiller et Accéder aux Rapports
          </button>
        </form>
      </div>
    `;

    const form = container.querySelector('#export-unlock-form');
    const pwdInput = container.querySelector('#export-admin-pwd');
    const submitBtn = container.querySelector('#btn-export-unlock');
    const errorEl = container.querySelector('#export-unlock-error');

    setTimeout(() => pwdInput?.focus(), 100);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = (pwdInput?.value || '').trim();
      if (!pwd) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Vérification...';
      errorEl.style.display = 'none';

      try {
        await api.loginAdmin(pwd);
        window.app?.showToast('🔑 Accès aux rapports déverrouillé avec succès', 'success');
        renderExportView(container);
      } catch (err) {
        errorEl.textContent = err.message || 'Mot de passe incorrect.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '🔓 Déverrouiller et Accéder aux Rapports';
        pwdInput.select();
      }
    });

    return;
  }

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
          <span>📊 Rapports &amp; Exportations par Journée</span>
        </h1>
        <p>Générez et téléchargez directement les classeurs Excel (.xlsx) et fiches certifiées PDF (.pdf)</p>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="role-badge role-admin" style="font-size:0.75rem;padding:6px 14px;">👑 SESSION ADMIN VALIDÉE</span>
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

  // --- Programmatic file download via fetch (prevents JSON page redirect) ---
  async function downloadReport(urlEndpoint, defaultFilename, btnElement) {
    const originalText = btnElement ? btnElement.innerHTML : '';
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerHTML = `
        <span class="postes-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></span>
        Génération en cours...
      `;
    }

    const toastMsg = defaultFilename.endsWith('.xlsx')
      ? '📊 Génération du classeur Excel en cours...'
      : '📄 Génération de la fiche PDF en cours...';
    window.app?.showToast(toastMsg, 'info');

    try {
      const token = getAdminToken();
      const url = new URL(urlEndpoint, window.location.origin);
      if (token) {
        url.searchParams.set('admin_token', token);
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: api.getHeaders()
      });

      if (!res.ok) {
        let errorMsg = `Erreur HTTP ${res.status}`;
        try {
          const json = await res.json();
          errorMsg = json.error || errorMsg;
        } catch (_) {}
        throw new Error(errorMsg);
      }

      let filename = defaultFilename;
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1].trim();
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);

      window.app?.showToast(`✅ ${filename} téléchargé avec succès !`, 'success');
    } catch (err) {
      window.app?.showToast(`Échec du téléchargement : ${err.message}`, 'error');
    } finally {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = originalText;
      }
    }
  }

  const today = new Date().toISOString().substring(0, 10);

  // --- Handlers Journée Info ---
  const btnInfoExcel = container.querySelector('#btn-export-info-excel');
  btnInfoExcel?.addEventListener('click', () => {
    const filter = container.querySelector('#export-info-filter').value;
    downloadReport(
      `/api/export/excel?filter=${encodeURIComponent(filter)}&session=info`,
      `presences_journee_info_${today}.xlsx`,
      btnInfoExcel
    );
  });

  const btnInfoPdf = container.querySelector('#btn-export-info-pdf');
  btnInfoPdf?.addEventListener('click', () => {
    const filter = container.querySelector('#export-info-filter').value;
    const title = encodeURIComponent('LISTE DES PRÉSENCES — JOURNÉE D\'INFORMATION');
    downloadReport(
      `/api/export/pdf?filter=${encodeURIComponent(filter)}&session=info&title=${title}`,
      `presences_journee_info_${today}.pdf`,
      btnInfoPdf
    );
  });

  // --- Handlers Journée Test ---
  const btnTestExcel = container.querySelector('#btn-export-test-excel');
  btnTestExcel?.addEventListener('click', () => {
    const filter = container.querySelector('#export-test-filter').value;
    downloadReport(
      `/api/export/excel?filter=${encodeURIComponent(filter)}&session=test`,
      `presences_journee_test_${today}.xlsx`,
      btnTestExcel
    );
  });

  const btnTestPdf = container.querySelector('#btn-export-test-pdf');
  btnTestPdf?.addEventListener('click', () => {
    const filter = container.querySelector('#export-test-filter').value;
    const title = encodeURIComponent('LISTE DES PRÉSENCES — JOURNÉE DU TEST');
    downloadReport(
      `/api/export/pdf?filter=${encodeURIComponent(filter)}&session=test&title=${title}`,
      `presences_journee_test_${today}.pdf`,
      btnTestPdf
    );
  });

  // --- Handlers Global ---
  const btnGlobalExcel = container.querySelector('#btn-export-global-excel');
  btnGlobalExcel?.addEventListener('click', () => {
    const filter = container.querySelector('#export-global-filter').value;
    downloadReport(
      `/api/export/excel?filter=${encodeURIComponent(filter)}&session=both`,
      `presences_comparatif_global_${today}.xlsx`,
      btnGlobalExcel
    );
  });

  const btnGlobalPdf = container.querySelector('#btn-export-global-pdf');
  btnGlobalPdf?.addEventListener('click', () => {
    const filter = container.querySelector('#export-global-filter').value;
    const title = encodeURIComponent('LISTE DE PRÉSENCE COMPARATIVE — INFO ET TEST');
    downloadReport(
      `/api/export/pdf?filter=${encodeURIComponent(filter)}&session=both&title=${title}`,
      `presences_comparatif_global_${today}.pdf`,
      btnGlobalPdf
    );
  });
}
