import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export function renderImportView(container) {
  let currentFile = null;
  let currentSessionId = null;
  let currentAnalysis = null;

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-group">
        <h1>📂 Charger un fichier Excel</h1>
        <p>Étape 1 du processus — Importez la liste des participants dans la base de données</p>
      </div>
    </div>

    <!-- ===== PROGRESS STEPS ===== -->
    <div class="import-steps" id="import-steps-bar">
      <div class="import-step-item active" id="step-item-1">
        <span class="import-step-num">1</span>
        <span>Choisir le fichier Excel</span>
      </div>
      <div class="import-step-item" id="step-item-2">
        <span class="import-step-num">2</span>
        <span>Vérifier les colonnes</span>
      </div>
      <div class="import-step-item" id="step-item-3">
        <span class="import-step-num">3</span>
        <span>Confirmer et charger</span>
      </div>
    </div>

    <!-- ===== STEP 1: Upload ===== -->
    <div id="import-step-upload">

      <div class="dropzone" id="excel-dropzone">
        <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <div class="dropzone-title">Glissez votre fichier ici</div>
        <div class="dropzone-desc">
          Déposez votre fichier Excel directement dans cette zone, ou cliquez sur le bouton ci-dessous pour le sélectionner depuis votre ordinateur.
        </div>
        <div class="dropzone-formats">
          <span class="format-badge">.xlsx</span>
          <span class="format-badge">.xls</span>
          <span class="format-badge">.csv</span>
        </div>
        <input type="file" id="excel-file-input" accept=".xlsx, .xls, .csv" style="display: none;" />
        <button class="btn btn-primary btn-lg" id="btn-browse-file" style="margin-top: 4px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Parcourir et choisir un fichier
        </button>
      </div>

    </div>

    <!-- ===== STEP 2+3: Mapping & Preview (Hidden initially) ===== -->
    <div id="import-step-preview" style="display: none;">

      <!-- Navigation header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button class="btn btn-secondary" id="btn-cancel-import">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Annuler
          </button>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size: 1rem; font-weight: 700; color: var(--text-main);" id="preview-filename-badge">fichier.xlsx</span>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Vérifiez les correspondances de colonnes avant de confirmer</span>
          </div>
        </div>

        <button class="btn btn-success btn-lg" id="btn-execute-import">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Confirmer et charger dans la base
        </button>
      </div>

      <div id="import-alerts-zone"></div>

      <!-- Mapping Card -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 22px; margin-bottom: 22px;">
        <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:16px;">
          <div style="font-size:1.5rem; line-height:1;">🗂️</div>
          <div>
            <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
              Association des colonnes
            </h3>
            <p style="font-size: 0.84rem; color: var(--text-secondary);">
              Le système a automatiquement détecté les colonnes de votre fichier. Vérifiez et ajustez si nécessaire.
            </p>
          </div>
        </div>

        <div class="mapping-grid" id="mapping-fields-container"></div>

        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" id="update-duplicates-check" style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--color-primary);">
          <label for="update-duplicates-check" style="font-size: 0.88rem; cursor: pointer; color: var(--text-main);">
            <strong>Mettre à jour les doublons</strong> — si un matricule existe déjà, mettre à jour les informations.
          </label>
        </div>
      </div>

      <!-- Preview Table -->
      <div class="table-card" style="margin-bottom: 30px;">
        <div class="table-toolbar">
          <h4 style="font-size: 0.95rem; font-weight: 700; display:flex; align-items:center; gap:8px;">
            <span>👁️</span> Aperçu des 10 premières lignes
          </h4>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="preview-table">
            <thead id="preview-thead"></thead>
            <tbody id="preview-tbody"></tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- ===== SECTION: Fichiers chargés ===== -->
    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border-subtle);" id="files-section">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            📁 Fichiers déjà chargés dans la base
          </h2>
          <p style="font-size: 0.84rem; color: var(--text-secondary);">
            Supprimez un fichier pour retirer automatiquement toutes les personnes importées depuis ce fichier.
          </p>
        </div>
        <button class="btn btn-danger btn-sm" id="btn-wipe-all-data">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
          Vider entièrement la base
        </button>
      </div>

      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 46px;">#</th>
                <th>Nom du fichier Excel</th>
                <th>Date d'importation</th>
                <th>Lignes totales</th>
                <th>Personnes actives</th>
                <th style="text-align: right; width: 180px;">Action</th>
              </tr>
            </thead>
            <tbody id="files-table-body">
              <tr>
                <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
                  Chargement...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const stepUpload = container.querySelector('#import-step-upload');
  const stepPreview = container.querySelector('#import-step-preview');
  const dropzone = container.querySelector('#excel-dropzone');
  const fileInput = container.querySelector('#excel-file-input');
  const btnBrowse = container.querySelector('#btn-browse-file');
  const btnCancel = container.querySelector('#btn-cancel-import');
  const btnExecute = container.querySelector('#btn-execute-import');
  const filenameBadge = container.querySelector('#preview-filename-badge');
  const mappingContainer = container.querySelector('#mapping-fields-container');
  const alertsZone = container.querySelector('#import-alerts-zone');
  const previewThead = container.querySelector('#preview-thead');
  const previewTbody = container.querySelector('#preview-tbody');
  const updateDupCheck = container.querySelector('#update-duplicates-check');
  const filesTbody = container.querySelector('#files-table-body');
  const btnWipeAll = container.querySelector('#btn-wipe-all-data');

  // Step indicators
  function setStep(step) {
    for (let i = 1; i <= 3; i++) {
      const el = container.querySelector(`#step-item-${i}`);
      if (!el) continue;
      el.classList.remove('active', 'done');
      if (i < step) el.classList.add('done');
      else if (i === step) el.classList.add('active');
    }
  }

  btnBrowse?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  btnCancel?.addEventListener('click', () => {
    currentFile = null;
    currentSessionId = null;
    currentAnalysis = null;
    fileInput.value = '';
    stepPreview.style.display = 'none';
    stepUpload.style.display = 'block';
    setStep(1);
  });

  async function handleFile(file) {
    currentFile = file;
    window.app.showToast('📖 Lecture du fichier Excel en cours…', 'info');
    setStep(2);
    try {
      const res = await api.uploadExcelPreview(file);
      currentSessionId = res.sessionId;
      currentAnalysis = res.analysis;
      displayPreview(res);
    } catch (err) {
      window.app.showToast(err.message, 'error');
      setStep(1);
    }
  }

  function displayPreview(data) {
    const analysis = data.analysis;
    stepUpload.style.display = 'none';
    stepPreview.style.display = 'block';
    filenameBadge.textContent = `${data.filename} — ${analysis.totalRows} lignes détectées`;
    setStep(3);

    // Alerts
    let alertsHtml = '';
    if (analysis.duplicateCount > 0) {
      alertsHtml += `
        <div class="alert-box alert-warning">
          <span>⚠️</span>
          <span><strong>Doublons détectés :</strong> ${analysis.duplicateCount} matricule(s) en double dans le fichier.</span>
        </div>`;
    }
    if (analysis.incompleteCount > 0) {
      alertsHtml += `
        <div class="alert-box alert-warning">
          <span>⚠️</span>
          <span><strong>Lignes incomplètes :</strong> ${analysis.incompleteCount} ligne(s) sans nom seront ignorées.</span>
        </div>`;
    }
    if (!alertsHtml) {
      alertsHtml = `
        <div class="alert-box alert-success">
          <span>✅</span>
          <span><strong>Fichier valide :</strong> ${analysis.totalRows} lignes prêtes pour l'importation.</span>
        </div>`;
    }
    alertsZone.innerHTML = alertsHtml;

    // Mapping fields
    const standardFields = [
      { key: 'matricule', label: 'Matricule (Identifiant unique)' },
      { key: 'nom', label: 'Nom de famille *' },
      { key: 'postnom', label: 'Post-nom' },
      { key: 'prenom', label: 'Prénom' },
      { key: 'sexe', label: 'Genre / Sexe' },
      { key: 'sn', label: 'Numéro de série / SN' }
    ];

    const optionsHtml = ['<option value="">— Ignorer ce champ —</option>']
      .concat(analysis.headers.map(h => `<option value="${h}">${h}</option>`))
      .join('');

    mappingContainer.innerHTML = standardFields.map(sf => `
      <div class="mapping-field-card">
        <label class="mapping-field-label">${sf.label}</label>
        <select class="mapping-field-select" data-field-key="${sf.key}">${optionsHtml}</select>
      </div>
    `).join('');

    mappingContainer.querySelectorAll('.mapping-field-select').forEach(sel => {
      const key = sel.getAttribute('data-field-key');
      const val = analysis.suggestedMapping[key];
      if (val) sel.value = val;
    });

    previewThead.innerHTML = `<tr>${analysis.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
    previewTbody.innerHTML = analysis.previewRows.map(row => `
      <tr>${analysis.headers.map(h => `<td>${escapeHtml(row[h] !== undefined ? row[h] : '')}</td>`).join('')}</tr>
    `).join('');
  }

  btnExecute?.addEventListener('click', async () => {
    if (!currentSessionId) return;

    const mapping = {};
    mappingContainer.querySelectorAll('.mapping-field-select').forEach(sel => {
      const key = sel.getAttribute('data-field-key');
      const val = sel.value;
      if (val) mapping[key] = val;
    });

    if (!mapping.nom) {
      window.app.showToast('⚠️ Associez au moins la colonne "Nom" pour pouvoir importer.', 'warning');
      return;
    }

    btnExecute.disabled = true;
    btnExecute.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"
        style="animation: spin 1s linear infinite;">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Importation en cours…`;

    try {
      const res = await api.confirmExcelImport(currentSessionId, mapping, updateDupCheck.checked);
      window.app.showToast(`✅ ${res.message}`, 'success');
      loadImportedFiles();
      stepPreview.style.display = 'none';
      stepUpload.style.display = 'block';
      setStep(1);

      // Navigate to search after 1.2s
      setTimeout(() => window.app.navigate('search'), 1200);
    } catch (err) {
      btnExecute.disabled = false;
      btnExecute.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        Confirmer et charger dans la base`;
      window.app.showToast(`Erreur : ${err.message}`, 'error');
    }
  });

  // Load imported files list
  async function loadImportedFiles() {
    try {
      const files = await api.fetchExcelFiles();

      if (!files || files.length === 0) {
        filesTbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 36px; color: var(--text-muted);">
              <div style="font-size:1.5rem; margin-bottom:8px;">📭</div>
              Aucun fichier Excel importé pour le moment.
            </td>
          </tr>`;
        return;
      }

      filesTbody.innerHTML = files.map((f, idx) => `
        <tr>
          <td><strong>${idx + 1}</strong></td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1rem;">📄</span>
              <strong style="color: var(--text-main);">${escapeHtml(f.filename)}</strong>
            </div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">${f.imported_at}</td>
          <td>${f.total_rows} lignes</td>
          <td>
            <span class="presence-status-badge present" style="font-size: 0.75rem; padding: 2px 10px;">
              ${f.current_persons_count} personnes
            </span>
          </td>
          <td style="text-align: right;">
            <button class="btn btn-danger btn-sm" data-delete-file-id="${f.id}" data-filename="${f.filename}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              Supprimer
            </button>
          </td>
        </tr>
      `).join('');

      filesTbody.querySelectorAll('[data-delete-file-id]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-delete-file-id');
          const fname = btn.getAttribute('data-filename');
          const ok = confirm(`Supprimer le fichier "${fname}" ?\n\nToutes les personnes importées depuis ce fichier seront retirées de la base.`);
          if (!ok) return;
          try {
            const res = await api.deleteExcelFile(id);
            window.app.showToast(res.message, 'success');
            loadImportedFiles();
          } catch (err) {
            window.app.showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      filesTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: var(--color-danger);">
            Erreur lors du chargement : ${err.message}
          </td>
        </tr>`;
    }
  }

  btnWipeAll?.addEventListener('click', async () => {
    const ok = confirm('⚠️ ATTENTION : Cette action va effacer TOUTES les données de la base de données.\n\nCette action est irréversible. Êtes-vous certain ?');
    if (!ok) return;
    try {
      await api.clearAllData();
      window.app.showToast('Toutes les données ont été effacées.', 'info');
      loadImportedFiles();
    } catch (err) {
      window.app.showToast(err.message, 'error');
    }
  });

  loadImportedFiles();
}
