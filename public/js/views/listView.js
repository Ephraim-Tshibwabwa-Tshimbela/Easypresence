import { api } from '../api.js';
import { store } from '../state.js';

/**
 * Escapes HTML special characters to prevent XSS in innerHTML templates.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderListView(container, presetMode = 'all') {
  let activeMode = presetMode; // 'all', 'present_info', 'present_test', 'both'
  let currentPage = 1;
  let currentLimit = 25;
  let currentSexe = 'all';
  let currentSearch = '';
  let selectedIds = new Set();
  let totalRows = 0;
  let totalPages = 1;

  function getQueryFilters() {
    let statusInfo = 'all';
    let statusTest = 'all';
    let statusCombo = 'all';

    if (activeMode === 'present_info') {
      statusInfo = 'present';
    } else if (activeMode === 'present_test') {
      statusTest = 'present';
    } else if (activeMode === 'both') {
      statusCombo = 'both';
    }

    return { statusInfo, statusTest, statusCombo };
  }

  function getModeMetadata() {
    const stats = store.get('stats') || {};
    switch (activeMode) {
      case 'present_info':
        return {
          title: "📢 Liste des Présences — Journée d'Information",
          subtitle: `Uniquement les candidats émargés pour la Journée d'Information (${stats.presentInfo ?? 0} présents · ${stats.rateInfo ?? 0}%)`,
          excelParam: 'filter=present_info&session=info',
          pdfParam: 'filter=present_info&session=info&title=' + encodeURIComponent('LISTE DES PRÉSENCES — JOURNÉE D\'INFORMATION'),
          exportLabel: 'Journée Info',
          badgeColor: 'var(--color-primary)'
        };
      case 'present_test':
        return {
          title: "📝 Liste des Présences — Journée du Test",
          subtitle: `Uniquement les candidats émargés pour la Journée du Test (${stats.presentTest ?? 0} présents · ${stats.rateTest ?? 0}%)`,
          excelParam: 'filter=present_test&session=test',
          pdfParam: 'filter=present_test&session=test&title=' + encodeURIComponent('LISTE DES PRÉSENCES — JOURNÉE DU TEST'),
          exportLabel: 'Journée Test',
          badgeColor: 'var(--color-success)'
        };
      case 'both':
        return {
          title: "⭐ Liste des Présents aux 2 Séances (Info & Test)",
          subtitle: `Candidats ayant participé à la fois à l'Information et au Test (${stats.presentBoth ?? 0} personnes)`,
          excelParam: 'filter=present_both&session=both',
          pdfParam: 'filter=present_both&session=both&title=' + encodeURIComponent('LISTE DES PRÉSENTS AUX DEUX SÉANCES'),
          exportLabel: '2 Séances',
          badgeColor: 'var(--color-purple)'
        };
      default:
        return {
          title: "📋 Registre Général des Inscrits & Présences",
          subtitle: `Suivi complet de l'ensemble des candidats (${stats.total ?? 0} inscrits)`,
          excelParam: 'filter=all&session=all',
          pdfParam: 'filter=all&session=all&title=' + encodeURIComponent('REGISTRE COMPLET DES PRÉSENCES — INFO ET TEST'),
          exportLabel: 'Registre Complet',
          badgeColor: 'var(--text-secondary)'
        };
    }
  }

  function renderSkeleton() {
    const stats = store.get('stats') || {};
    const meta = getModeMetadata();

    container.innerHTML = `
      <!-- View Header with Title and Export Actions -->
      <div class="view-header">
        <div class="view-title-group">
          <h1 id="view-mode-title">${meta.title}</h1>
          <p id="view-mode-subtitle">${meta.subtitle}</p>
        </div>

        <div class="view-actions session-export-actions">
          <button class="btn btn-success btn-sm" id="btn-export-excel" title="Télécharger le fichier Excel de cette sélection">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span id="btn-excel-label">Exporter Excel (.xlsx)</span>
          </button>

          <button class="btn btn-primary btn-sm" id="btn-export-pdf" title="Télécharger la fiche PDF imprimable">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            <span id="btn-pdf-label">Exporter PDF (.pdf)</span>
          </button>

          <button class="btn btn-secondary btn-sm" id="list-btn-refresh" title="Actualiser la liste">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="view-mode-tabs" id="view-mode-tabs">
        <button class="view-mode-tab tab-info ${activeMode === 'present_info' ? 'active' : ''}" data-mode="present_info">
          📢 Présences Journée Info 
          <span class="tab-badge info" id="tab-badge-info">${stats.presentInfo ?? 0}</span>
        </button>
        <button class="view-mode-tab tab-test ${activeMode === 'present_test' ? 'active' : ''}" data-mode="present_test">
          📝 Présences Journée Test 
          <span class="tab-badge test" id="tab-badge-test">${stats.presentTest ?? 0}</span>
        </button>
        <button class="view-mode-tab tab-both ${activeMode === 'both' ? 'active' : ''}" data-mode="both">
          ⭐ Présents aux 2 Séances 
          <span class="tab-badge both" id="tab-badge-both">${stats.presentBoth ?? 0}</span>
        </button>
        <button class="view-mode-tab tab-all ${activeMode === 'all' ? 'active' : ''}" data-mode="all">
          📋 Tout le Registre 
          <span class="tab-badge all" id="tab-badge-all">${stats.total ?? 0}</span>
        </button>
      </div>

      <!-- Table Card -->
      <div class="table-card">
        <!-- Toolbar Filters -->
        <div class="table-toolbar">
          <div class="table-filter-group">
            <!-- Search input -->
            <div class="table-search-wrap" style="position: relative; display: flex; align-items: center; flex: 1; min-width: min(100%, 260px);">
              <input 
                type="text" 
                id="list-search-input" 
                class="filter-input" 
                placeholder="Rechercher nom, matricule ou SN (ex: 0008)..." 
                style="padding-left: 32px; width: 100%;"
                value="${currentSearch}"
              />
              <svg style="position: absolute; left: 10px; width: 14px; height: 14px; color: var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>

            <!-- Gender Filter -->
            <select id="list-filter-sexe" class="filter-select">
              <option value="all">Genre : Tous</option>
              <option value="M" ${currentSexe === 'M' ? 'selected' : ''}>Hommes</option>
              <option value="F" ${currentSexe === 'F' ? 'selected' : ''}>Femmes</option>
            </select>
          </div>

          <!-- Bulk Selection Actions -->
          <div id="bulk-actions-container" style="display: none; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--color-primary);" id="selected-count-badge">0 sélectionné(s)</span>
            <button class="btn btn-primary btn-sm" id="btn-bulk-info-present">☑ Info Présents</button>
            <button class="btn btn-success btn-sm" id="btn-bulk-test-present">☑ Test Présents</button>
            <button class="btn btn-secondary btn-sm" id="btn-bulk-info-absent">☒ Info Absents</button>
            <button class="btn btn-secondary btn-sm" id="btn-bulk-test-absent">☒ Test Absents</button>
          </div>
        </div>

        <!-- Dynamic Table (Columns adapt based on mode) -->
        <div class="table-responsive">
          <table class="data-table">
            <thead id="list-table-head">
              ${getTableHeadHtml()}
            </thead>
            <tbody id="list-table-body">
              <tr>
                <td colspan="${activeMode === 'all' || activeMode === 'both' ? 7 : 6}" style="text-align: center; padding: 40px; color: var(--text-muted);">
                  Chargement des données...
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="pagination-bar">
          <div id="pagination-info">Affichage de 0 à 0 sur 0 lignes</div>

          <div class="pagination-controls">
            <select id="list-page-size" class="filter-select" style="padding: 4px 8px; font-size: 0.8rem;">
              <option value="25" ${currentLimit === 25 ? 'selected' : ''}>25 / page</option>
              <option value="50" ${currentLimit === 50 ? 'selected' : ''}>50 / page</option>
              <option value="100" ${currentLimit === 100 ? 'selected' : ''}>100 / page</option>
            </select>

            <button class="btn btn-secondary btn-sm" id="btn-prev-page" disabled>Précédent</button>
            <span id="page-indicator" style="font-weight: 600; font-size: 0.85rem; padding: 0 8px;">1 / 1</span>
            <button class="btn btn-secondary btn-sm" id="btn-next-page" disabled>Suivant</button>
          </div>
        </div>
      </div>
    `;

    bindEventHandlers();
  }

  function getTableHeadHtml() {
    if (activeMode === 'present_info') {
      return `
        <tr>
          <th style="width: 40px; text-align: center;">
            <input type="checkbox" id="check-all-rows" style="cursor: pointer;">
          </th>
          <th style="width: 70px;">SN</th>
          <th style="width: 130px;">Matricule</th>
          <th>Nom & Prénoms</th>
          <th style="width: 60px; text-align: center;">Genre</th>
          <th style="width: 160px;">Statut Journée Info</th>
          <th style="width: 180px;">Émargement (Heure & Poste)</th>
          <th style="width: 110px; text-align: center;">Action</th>
        </tr>
      `;
    } else if (activeMode === 'present_test') {
      return `
        <tr>
          <th style="width: 40px; text-align: center;">
            <input type="checkbox" id="check-all-rows" style="cursor: pointer;">
          </th>
          <th style="width: 70px;">SN</th>
          <th style="width: 130px;">Matricule</th>
          <th>Nom & Prénoms</th>
          <th style="width: 60px; text-align: center;">Genre</th>
          <th style="width: 160px;">Statut Journée Test</th>
          <th style="width: 180px;">Émargement (Heure & Poste)</th>
          <th style="width: 110px; text-align: center;">Action</th>
        </tr>
      `;
    } else {
      // Both or All
      return `
        <tr>
          <th style="width: 40px; text-align: center;">
            <input type="checkbox" id="check-all-rows" style="cursor: pointer;">
          </th>
          <th style="width: 70px;">SN</th>
          <th style="width: 130px;">Matricule</th>
          <th>Nom & Prénoms</th>
          <th style="width: 60px; text-align: center;">Genre</th>
          <th style="width: 180px;">1. Journée Info</th>
          <th style="width: 180px;">2. Journée Test</th>
        </tr>
      `;
    }
  }

  function updateModeUI() {
    const meta = getModeMetadata();
    const titleEl = container.querySelector('#view-mode-title');
    const subEl = container.querySelector('#view-mode-subtitle');
    const headEl = container.querySelector('#list-table-head');

    if (titleEl) titleEl.textContent = meta.title;
    if (subEl) subEl.textContent = meta.subtitle;
    if (headEl) headEl.innerHTML = getTableHeadHtml();

    // Update tab active classes
    container.querySelectorAll('.view-mode-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-mode') === activeMode);
    });

    // Update badge counts from state
    const stats = store.get('stats') || {};
    const bInfo = container.querySelector('#tab-badge-info');
    const bTest = container.querySelector('#tab-badge-test');
    const bBoth = container.querySelector('#tab-badge-both');
    const bAll = container.querySelector('#tab-badge-all');
    if (bInfo) bInfo.textContent = stats.presentInfo ?? 0;
    if (bTest) bTest.textContent = stats.presentTest ?? 0;
    if (bBoth) bBoth.textContent = stats.presentBoth ?? 0;
    if (bAll) bAll.textContent = stats.total ?? 0;

    // Clear selection
    selectedIds.clear();
    updateBulkBar();
  }

  async function loadData() {
    const tbody = container.querySelector('#list-table-body');
    if (!tbody) return;

    try {
      const filters = getQueryFilters();
      const res = await api.fetchPersons({
        page: currentPage,
        limit: currentLimit,
        statusInfo: filters.statusInfo,
        statusTest: filters.statusTest,
        statusCombo: filters.statusCombo,
        sexe: currentSexe,
        search: currentSearch
      });

      totalRows = res.total;
      totalPages = res.totalPages;
      renderRows(res.data);
      updatePaginationControls();
    } catch (err) {
      const colSpan = activeMode === 'all' || activeMode === 'both' ? 7 : 8;
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" style="text-align: center; padding: 30px; color: var(--color-danger);">
            Erreur de chargement : ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function renderRows(rows) {
    const tbody = container.querySelector('#list-table-body');
    if (!tbody) return;

    const colSpan = activeMode === 'all' || activeMode === 'both' ? 7 : 8;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" style="text-align: center; padding: 48px; color: var(--text-muted);">
            Aucune personne ne correspond à cette sélection.
          </td>
        </tr>
      `;
      return;
    }

    if (activeMode === 'present_info') {
      // Single Day: Info Present
      tbody.innerHTML = rows.map((p, index) => {
        const isChecked = selectedIds.has(p.id);
        const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
        const isPresentInfo = p.is_present_info === 1;

        return `
          <tr data-row-id="${p.id}">
            <td style="text-align: center;">
              <input type="checkbox" class="row-checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
            </td>
            <td><strong style="color: var(--color-primary); font-family: var(--font-mono);">${p.sn ? escapeHtml(p.sn) : ((currentPage - 1) * currentLimit + index + 1)}</strong></td>
            <td><span class="person-matricule">${escapeHtml(p.matricule || '-')}</span></td>
            <td><strong>${escapeHtml(fullName)}</strong></td>
            <td style="text-align: center;">${escapeHtml(p.sexe || '-')}</td>
            <td>
              <span class="presence-status-badge ${isPresentInfo ? 'present' : 'absent'}" style="font-size: 0.78rem;">
                ${isPresentInfo ? '🟢 Présent Info' : '⚪ Absent'}
              </span>
            </td>
            <td>
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">${escapeHtml(p.present_at_info || '-')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${p.present_by_info ? 'Agent : ' + escapeHtml(p.present_by_info) : ''}</div>
            </td>
            <td style="text-align: center;">
              <button class="btn btn-sm btn-secondary" 
                      data-toggle-id="${p.id}" 
                      data-session="info"
                      title="Annuler ou modifier le statut Info"
                      style="font-size: 0.75rem; padding: 3px 8px;">
                ${isPresentInfo ? 'Marquer Absent' : '☑ Info'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

    } else if (activeMode === 'present_test') {
      // Single Day: Test Present
      tbody.innerHTML = rows.map((p, index) => {
        const isChecked = selectedIds.has(p.id);
        const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
        const isPresentTest = p.is_present_test === 1;

        return `
          <tr data-row-id="${p.id}">
            <td style="text-align: center;">
              <input type="checkbox" class="row-checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
            </td>
            <td><strong style="color: var(--color-primary); font-family: var(--font-mono);">${p.sn ? escapeHtml(p.sn) : ((currentPage - 1) * currentLimit + index + 1)}</strong></td>
            <td><span class="person-matricule">${escapeHtml(p.matricule || '-')}</span></td>
            <td><strong>${escapeHtml(fullName)}</strong></td>
            <td style="text-align: center;">${escapeHtml(p.sexe || '-')}</td>
            <td>
              <span class="presence-status-badge ${isPresentTest ? 'present' : 'absent'}" style="font-size: 0.78rem;">
                ${isPresentTest ? '🟢 Présent Test' : '⚪ Absent'}
              </span>
            </td>
            <td>
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">${escapeHtml(p.present_at_test || '-')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${p.present_by_test ? 'Agent : ' + escapeHtml(p.present_by_test) : ''}</div>
            </td>
            <td style="text-align: center;">
              <button class="btn btn-sm btn-secondary" 
                      data-toggle-id="${p.id}" 
                      data-session="test"
                      title="Annuler ou modifier le statut Test"
                      style="font-size: 0.75rem; padding: 3px 8px;">
                ${isPresentTest ? 'Marquer Absent' : '☑ Test'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

    } else {
      // Full Registry or Both Sessions
      tbody.innerHTML = rows.map((p, index) => {
        const isPresentInfo = p.is_present_info === 1;
        const isPresentTest = p.is_present_test === 1;
        const isChecked = selectedIds.has(p.id);
        const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');

        return `
          <tr data-row-id="${p.id}">
            <td style="text-align: center;">
              <input type="checkbox" class="row-checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
            </td>
            <td><strong style="color: var(--color-primary); font-family: var(--font-mono);">${p.sn ? escapeHtml(p.sn) : ((currentPage - 1) * currentLimit + index + 1)}</strong></td>
            <td><span class="person-matricule">${escapeHtml(p.matricule || '-')}</span></td>
            <td><strong>${escapeHtml(fullName)}</strong></td>
            <td style="text-align: center;">${escapeHtml(p.sexe || '-')}</td>
            
            <!-- Column 1: Journée Info -->
            <td>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span class="presence-status-badge ${isPresentInfo ? 'present' : 'absent'}" style="font-size: 0.75rem; padding: 2px 8px;">
                  ${isPresentInfo ? '🟢 Présent' : '⚪ Absent'}
                </span>
                <button class="btn btn-sm ${isPresentInfo ? 'btn-secondary' : 'btn-primary'}" 
                        data-toggle-id="${p.id}" 
                        data-session="info"
                        style="font-size: 0.75rem; padding: 3px 8px;">
                  ${isPresentInfo ? 'Absent' : '☑ Info'}
                </button>
              </div>
              ${p.present_at_info ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(p.present_at_info)} (${escapeHtml(p.present_by_info || 'Poste')})</div>` : ''}
            </td>

            <!-- Column 2: Journée Test -->
            <td>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span class="presence-status-badge ${isPresentTest ? 'present' : 'absent'}" style="font-size: 0.75rem; padding: 2px 8px;">
                  ${isPresentTest ? '🟢 Présent' : '⚪ Absent'}
                </span>
                <button class="btn btn-sm ${isPresentTest ? 'btn-secondary' : 'btn-success'}" 
                        data-toggle-id="${p.id}" 
                        data-session="test"
                        style="font-size: 0.75rem; padding: 3px 8px;">
                  ${isPresentTest ? 'Absent' : '☑ Test'}
                </button>
              </div>
              ${p.present_at_test ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(p.present_at_test)} (${escapeHtml(p.present_by_test || 'Poste')})</div>` : ''}
            </td>
          </tr>
        `;
      }).join('');
    }

    // Attach row toggle listeners
    tbody.querySelectorAll('[data-toggle-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-toggle-id');
        const session = btn.getAttribute('data-session');
        try {
          await api.togglePresence(id, session, null);
          loadData();
        } catch (err) {
          window.app.showToast(err.message, 'error');
        }
      });
    });

    // Checkbox listeners
    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.getAttribute('data-id'), 10);
        if (e.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateBulkBar();
      });
    });
  }

  function updateBulkBar() {
    const bulkContainer = container.querySelector('#bulk-actions-container');
    const bulkCountBadge = container.querySelector('#selected-count-badge');
    if (!bulkContainer) return;

    if (selectedIds.size > 0) {
      bulkContainer.style.display = 'flex';
      if (bulkCountBadge) bulkCountBadge.textContent = `${selectedIds.size} sélectionné(s)`;
    } else {
      bulkContainer.style.display = 'none';
    }
  }

  function updatePaginationControls() {
    const paginationInfo = container.querySelector('#pagination-info');
    const pageIndicator = container.querySelector('#page-indicator');
    const btnPrev = container.querySelector('#btn-prev-page');
    const btnNext = container.querySelector('#btn-next-page');

    const start = totalRows > 0 ? (currentPage - 1) * currentLimit + 1 : 0;
    const end = Math.min(currentPage * currentLimit, totalRows);
    if (paginationInfo) paginationInfo.textContent = `Affichage de ${start} à ${end} sur ${totalRows} personne(s)`;
    if (pageIndicator) pageIndicator.textContent = `${currentPage} / ${totalPages}`;

    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;
  }

  function bindEventHandlers() {
    // Mode Switcher Tabs
    container.querySelectorAll('.view-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeMode = tab.getAttribute('data-mode');
        currentPage = 1;
        updateModeUI();
        loadData();
      });
    });

    // Export Excel Button
    container.querySelector('#btn-export-excel')?.addEventListener('click', () => {
      const meta = getModeMetadata();
      window.location.href = `/api/export/excel?${meta.excelParam}`;
      window.app.showToast(`Téléchargement Excel (${meta.exportLabel})...`, 'info');
    });

    // Export PDF Button
    container.querySelector('#btn-export-pdf')?.addEventListener('click', () => {
      const meta = getModeMetadata();
      window.location.href = `/api/export/pdf?${meta.pdfParam}`;
      window.app.showToast(`Génération et téléchargement PDF (${meta.exportLabel})...`, 'info');
    });

    // Gender filter
    container.querySelector('#list-filter-sexe')?.addEventListener('change', (e) => {
      currentSexe = e.target.value;
      currentPage = 1;
      loadData();
    });

    // Search filter
    let searchTimeout = null;
    const searchInput = container.querySelector('#list-search-input');
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadData();
      }, 150);
    });

    // Page size
    container.querySelector('#list-page-size')?.addEventListener('change', (e) => {
      currentLimit = parseInt(e.target.value, 10);
      currentPage = 1;
      loadData();
    });

    // Prev / Next page
    container.querySelector('#btn-prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadData();
      }
    });

    container.querySelector('#btn-next-page')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadData();
      }
    });

    // Check all
    container.querySelector('#check-all-rows')?.addEventListener('change', (e) => {
      const checkboxes = container.querySelectorAll('.row-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const id = parseInt(cb.getAttribute('data-id'), 10);
        if (e.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      });
      updateBulkBar();
    });

    // Refresh
    container.querySelector('#list-btn-refresh')?.addEventListener('click', () => {
      loadData();
    });

    // Bulk Handlers
    container.querySelector('#btn-bulk-info-present')?.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      try {
        await api.bulkMarkPresence(Array.from(selectedIds), 'info', true);
        window.app.showToast(`${selectedIds.size} personne(s) marquée(s) présente(s) (Journée Info) !`, 'success');
        selectedIds.clear();
        updateBulkBar();
        loadData();
      } catch (err) {
        window.app.showToast(err.message, 'error');
      }
    });

    container.querySelector('#btn-bulk-test-present')?.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      try {
        await api.bulkMarkPresence(Array.from(selectedIds), 'test', true);
        window.app.showToast(`${selectedIds.size} personne(s) marquée(s) présente(s) (Journée Test) !`, 'success');
        selectedIds.clear();
        updateBulkBar();
        loadData();
      } catch (err) {
        window.app.showToast(err.message, 'error');
      }
    });

    container.querySelector('#btn-bulk-info-absent')?.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      try {
        await api.bulkMarkPresence(Array.from(selectedIds), 'info', false);
        window.app.showToast(`${selectedIds.size} personne(s) marquée(s) absente(s) (Journée Info) !`, 'info');
        selectedIds.clear();
        updateBulkBar();
        loadData();
      } catch (err) {
        window.app.showToast(err.message, 'error');
      }
    });

    container.querySelector('#btn-bulk-test-absent')?.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      try {
        await api.bulkMarkPresence(Array.from(selectedIds), 'test', false);
        window.app.showToast(`${selectedIds.size} personne(s) marquée(s) absente(s) (Journée Test) !`, 'info');
        selectedIds.clear();
        updateBulkBar();
        loadData();
      } catch (err) {
        window.app.showToast(err.message, 'error');
      }
    });
  }

  // Real-time synchronization
  const unbindWs = api.on('presence_updated', () => {
    updateModeUI();
    loadData();
  });
  const unbindBulk = api.on('bulk_presence_updated', () => {
    updateModeUI();
    loadData();
  });
  const unbindData = api.on('data_changed', () => {
    updateModeUI();
    loadData();
  });

  container._cleanup = () => {
    unbindWs();
    unbindBulk();
    unbindData();
  };

  renderSkeleton();
  loadData();
}
