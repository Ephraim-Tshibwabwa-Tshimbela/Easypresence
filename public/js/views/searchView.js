import { store } from '../state.js';
import { api } from '../api.js';

let activeSearchDebounce = null;
let currentResults = [];
let currentTerms = [];
let selectedIndex = 0;
let scannerMode = false;
let activeModalPerson = null;

/**
 * Safely highlights matching terms in a string.
 * CRITICAL FIX: Evaluates all terms in a SINGLE pass on raw text BEFORE inserting HTML.
 * Never executes iterative regex replacements on strings that already contain <mark> tags,
 * which previously destroyed HTML tags whenever terms matched 'm', 'a', 'r', 'k', 'c', 'l', 's', 'h'
 * (e.g. producing "<mark class="hl">BANZEmark> MONGA DEBORAH").
 */
function highlightMatch(text, terms) {
  if (!text) return '';
  const str = String(text);
  if (!terms || terms.length === 0) return escapeHtml(str);

  // Clean, trim and deduplicate terms; sort descending by length to match longest terms first
  const cleanTerms = Array.from(new Set(
    terms
      .map(t => String(t || '').trim())
      .filter(t => t.length > 0)
  )).sort((a, b) => b.length - a.length);

  if (cleanTerms.length === 0) return escapeHtml(str);

  // Build combined single regex escaping special regex characters
  const escapedTerms = cleanTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const combinedRegex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  // Split text by the capturing regex so matching substrings are preserved in alternate indices
  const parts = str.split(combinedRegex);
  return parts.map(part => {
    if (!part) return '';
    const isMatch = cleanTerms.some(t => part.toLowerCase() === t.toLowerCase());
    if (isMatch) {
      return `<mark class="hl">${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return isoStr; }
}

export function renderSearchView(container) {
  selectedIndex = 0;
  currentResults = [];
  currentTerms = [];
  activeModalPerson = null;

  const isAdmin = Boolean(store.get('isAdmin'));
  const activeSession = store.get('activeSession') || 'info';
  const activeSessionLabel = store.get('activeSessionLabel') || (activeSession === 'test' ? 'Journée de test' : "Journée d'information");
  const stats = store.get('stats') || {};
  const hasData = (stats.total ?? 0) > 0;

  // Session Selector UI: Admin controls, Client only views
  const sessionControlsHtml = isAdmin ? `
    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
      <span style="font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; white-space:nowrap;">
        📅 Journée active (Admin) :
      </span>
      <div class="session-selector">
        <button class="session-btn ${activeSession === 'info' ? 'active-info' : ''}" id="session-btn-info" title="Tous les postes pointeront pour la Journée d'information">
          <span>📢</span>
          <span>Journée d'information</span>
          ${activeSession === 'info' ? '<span class="active-check">✓</span>' : ''}
        </button>
        <button class="session-btn ${activeSession === 'test' ? 'active-test' : ''}" id="session-btn-test" title="Tous les postes pointeront pour la Journée de test">
          <span>📝</span>
          <span>Journée de test</span>
          ${activeSession === 'test' ? '<span class="active-check">✓</span>' : ''}
        </button>
      </div>
      <span class="session-badge ${activeSession}" id="session-active-badge">
        ${activeSession === 'info' ? '📢 Info active' : '📝 Test actif'}
      </span>
    </div>
  ` : `
    <div class="active-day-client-badge" id="client-day-badge">
      <span class="day-icon">${activeSession === 'test' ? '📝' : '📢'}</span>
      <div>
        <div class="day-title">
          Journée active : <strong style="color:${activeSession === 'test' ? 'var(--color-success)' : 'var(--color-primary)'};">${escapeHtml(activeSessionLabel)}</strong>
        </div>
        <div class="day-sub">
          🔒 Définie par l'Administrateur &bull; Tous vos pointages seront enregistrés pour cette séance
        </div>
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="search-page">

      <!-- ===== NO DATA HINT ===== -->
      ${!hasData ? `
      <div class="welcome-card" id="no-data-banner">
        <div class="welcome-icon">📂</div>
        <div class="welcome-text">
          <div class="welcome-title">Aucune donnée chargée</div>
          <div class="welcome-desc">
            ${isAdmin ? 'Commencez par importer votre fichier Excel pour charger les candidats.' : 'Le serveur ne contient pas encore de liste de candidats. Veuillez demander à l\'administrateur d\'importer un fichier.'}
          </div>
        </div>
        ${isAdmin ? `
        <button class="btn btn-primary" id="btn-go-import" style="flex-shrink:0;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
          </svg>
          Importer un fichier Excel
        </button>` : ''}
      </div>
      ` : ''}

      <!-- ===== STATS BAR ===== -->
      <div class="stats-bar" id="stats-bar">
        <div class="stat-pill clickable" id="sp-pill-total" title="Voir tout le registre">
          <span class="stat-pill-icon">👥</span>
          <span class="stat-pill-val" id="sp-total">${stats.total ?? 0}</span>
          <span class="stat-pill-lbl">inscrits</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-pill clickable" id="sp-pill-info" style="color: var(--color-primary);" title="Présents — Journée Info">
          <span class="stat-pill-icon">📢</span>
          <span class="stat-pill-val" id="sp-info">${stats.presentInfo ?? 0}</span>
          <span class="stat-pill-lbl">Info</span>
          <span class="stat-pill-rate" id="sp-info-rate">${stats.rateInfo ?? 0}%</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-pill clickable" id="sp-pill-test" style="color: var(--color-success);" title="Présents — Journée Test">
          <span class="stat-pill-icon">📝</span>
          <span class="stat-pill-val" id="sp-test">${stats.presentTest ?? 0}</span>
          <span class="stat-pill-lbl">Test</span>
          <span class="stat-pill-rate" id="sp-test-rate">${stats.rateTest ?? 0}%</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-pill clickable" id="sp-pill-both" style="color: var(--color-purple);" title="Présents aux deux séances">
          <span class="stat-pill-icon">⭐</span>
          <span class="stat-pill-val" id="sp-both">${stats.presentBoth ?? 0}</span>
          <span class="stat-pill-lbl">les 2</span>
        </div>
        <div class="stat-spacer"></div>
        <!-- Scanner Mode Toggle -->
        <label class="scanner-toggle" id="scanner-label" title="Pointage automatique quand un seul résultat">
          <input type="checkbox" id="scanner-mode-toggle" ${scannerMode ? 'checked' : ''}>
          <span class="scanner-slider"></span>
          <span class="scanner-lbl">🎯 Douchette</span>
        </label>
      </div>

      <!-- ===== SESSION SELECTOR BAR ===== -->
      <div id="session-controls-wrapper">
        ${sessionControlsHtml}
      </div>

      <!-- ===== SEARCH INPUT ===== -->
      <div class="search-box">
        <div class="search-input-wrap">
          <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            id="fast-search-input"
            class="search-field"
            placeholder="Rechercher par Nom, Matricule ou Numéro de série (SN)..."
            autocomplete="off"
            spellcheck="false"
            autofocus
          />
          <button class="search-clear" id="search-clear-btn" title="Effacer (Échap)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="search-meta" id="search-meta">
          <span class="meta-hint">Tapez pour rechercher &bull; <strong>Entrée</strong> ou clic sur <strong>Présent</strong> pour confirmer le pointage</span>
          <span class="meta-keys">
            <kbd class="kbd-badge">↓↑</kbd> naviguer &nbsp;
            <kbd class="kbd-badge">Entrée</kbd> pointer &nbsp;
            <kbd class="kbd-badge">Échap</kbd> effacer
          </span>
        </div>
      </div>

      <!-- ===== RESULTS ===== -->
      <div class="results-list" id="search-results-list">
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Tapez un nom, un matricule ou un numéro de série pour commencer la recherche.<br>
          <small id="empty-state-session-hint" style="color:var(--text-muted); margin-top:6px; display:block;">
            Séance de pointage active : <strong id="empty-state-session-name" style="color:${activeSession === 'test' ? 'var(--color-success)' : 'var(--color-primary)'}">${escapeHtml(activeSessionLabel)}</strong>
          </small></p>
        </div>
      </div>

    </div>
  `;

  const input = container.querySelector('#fast-search-input');
  const clearBtn = container.querySelector('#search-clear-btn');
  const scannerToggle = container.querySelector('#scanner-mode-toggle');
  const resultsEl = container.querySelector('#search-results-list');
  const metaEl = container.querySelector('#search-meta');
  const modalContainer = document.getElementById('modal-container');

  // Go to import (Admin only)
  container.querySelector('#btn-go-import')?.addEventListener('click', () => {
    window.app?.navigate('import');
  });

  // Admin Session switcher buttons
  if (isAdmin) {
    const btnInfo = container.querySelector('#session-btn-info');
    const btnTest = container.querySelector('#session-btn-test');

    btnInfo?.addEventListener('click', async () => {
      const cur = store.get('activeSession');
      if (cur === 'info') return;
      btnInfo.disabled = true;
      try {
        await api.setActiveSessionDay('info');
        window.app?.showToast("📢 Journée active définie : Journée d'information", 'success');
      } catch (err) {
        window.app?.showToast(`Erreur : ${err.message}`, 'error');
      } finally {
        btnInfo.disabled = false;
      }
    });

    btnTest?.addEventListener('click', async () => {
      const cur = store.get('activeSession');
      if (cur === 'test') return;
      btnTest.disabled = true;
      try {
        await api.setActiveSessionDay('test');
        window.app?.showToast("📝 Journée active définie : Journée de test", 'success');
      } catch (err) {
        window.app?.showToast(`Erreur : ${err.message}`, 'error');
      } finally {
        btnTest.disabled = false;
      }
    });
  }

  // Scanner toggle
  scannerToggle?.addEventListener('change', (e) => {
    scannerMode = e.target.checked;
    window.app?.showToast(scannerMode ? '🎯 Mode douchette activé' : 'Mode douchette désactivé', 'info');
  });

  // Keyboard navigation
  input?.addEventListener('keydown', (e) => {
    const len = currentResults.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (len > 0) { selectedIndex = (selectedIndex + 1) % len; updateHighlight(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (len > 0) { selectedIndex = (selectedIndex - 1 + len) % len; updateHighlight(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = currentResults[selectedIndex] || currentResults[0];
      if (target) {
        initiatePresenceConfirmation(target);
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      triggerSearch('');
    }
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    input.focus();
    triggerSearch('');
  });

  // Pill navigation
  container.querySelector('#sp-pill-total')?.addEventListener('click', () => window.app?.navigate('list'));
  container.querySelector('#sp-pill-info')?.addEventListener('click', () => window.app?.navigate('presences_info'));
  container.querySelector('#sp-pill-test')?.addEventListener('click', () => window.app?.navigate('presences_test'));
  container.querySelector('#sp-pill-both')?.addEventListener('click', () => window.app?.navigate('presences_both'));

  setTimeout(() => input?.focus(), 60);

  let latestSearchRequestId = 0;

  // Search Debounce: 180ms for manual typing to reduce LAN traffic, 15ms for barcode scanner
  input?.addEventListener('input', () => {
    clearTimeout(activeSearchDebounce);
    const delay = scannerMode ? 15 : 180;
    activeSearchDebounce = setTimeout(() => triggerSearch(input.value), delay);
  });

  async function triggerSearch(query) {
    const clean = (query || '').trim();
    const currentActiveSession = store.get('activeSession') || 'info';
    const currentActiveLabel = store.get('activeSessionLabel') || (currentActiveSession === 'test' ? 'Journée de test' : "Journée d'information");

    if (!clean) {
      currentResults = [];
      currentTerms = [];
      resultsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Tapez un nom, un matricule ou un numéro de série pour commencer la recherche.<br>
          <small id="empty-state-session-hint" style="color:var(--text-muted); margin-top:6px; display:block;">
            Séance de pointage active : <strong id="empty-state-session-name" style="color:${currentActiveSession === 'test' ? 'var(--color-success)' : 'var(--color-primary)'}">${escapeHtml(currentActiveLabel)}</strong>
          </small></p>
        </div>`;
      metaEl.innerHTML = `
        <span class="meta-hint">Tapez pour rechercher &bull; <strong>Entrée</strong> ou clic sur <strong>Présent</strong> pour pointer</span>
        <span class="meta-keys">
          <kbd class="kbd-badge">↓↑</kbd> naviguer &nbsp;
          <kbd class="kbd-badge">Entrée</kbd> pointer &nbsp;
          <kbd class="kbd-badge">Échap</kbd> effacer
        </span>`;
      return;
    }

    const thisRequestId = ++latestSearchRequestId;
    const t0 = performance.now();
    try {
      const res = await api.searchPersons(clean, 60);

      // Discard stale responses if a newer search was initiated
      if (thisRequestId !== latestSearchRequestId) {
        return;
      }

      const ms = (performance.now() - t0).toFixed(1);
      currentResults = res.data || [];
      currentTerms = clean.toLowerCase().split(/\s+/).filter(Boolean);
      selectedIndex = 0;

      // Auto trigger confirmation in scanner mode
      if (scannerMode && currentResults.length === 1) {
        initiatePresenceConfirmation(currentResults[0]);
      }

      const count = currentResults.length;
      metaEl.innerHTML = `
        <span class="meta-count"><strong>${count}</strong> résultat${count !== 1 ? 's' : ''} &bull; <span class="meta-ms">${ms} ms</span></span>
        <span class="meta-keys">
          <kbd class="kbd-badge">↓↑</kbd> naviguer &nbsp;
          <kbd class="kbd-badge">Entrée</kbd> pointer &nbsp;
          <kbd class="kbd-badge">Échap</kbd> effacer
        </span>`;

      renderResults();
    } catch (err) {
      if (thisRequestId === latestSearchRequestId) {
        metaEl.innerHTML = `<span style="color:var(--color-danger)">Erreur : ${escapeHtml(err.message)}</span>`;
      }
    }
  }

  function renderResults() {
    if (currentResults.length === 0 && currentTerms.length > 0) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">😕</div>
          <p>Aucun candidat trouvé pour cette recherche.<br>
          <small style="color:var(--text-muted); margin-top:4px; display:block;">Vérifiez l'orthographe du Nom, le Matricule ou le Numéro de Série (SN).</small></p>
        </div>`;
      return;
    }

    const currentActiveSession = store.get('activeSession') || 'info';
    const isTestActive = currentActiveSession === 'test';
    const activeLabel = isTestActive ? 'Journée de test' : "Journée d'information";

    resultsEl.innerHTML = currentResults.map((p, idx) => {
      const isPresentActive = isTestActive ? p.is_present_test === 1 : p.is_present_info === 1;
      const isSel = idx === selectedIndex;

      const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
      const initials = ((p.nom?.[0] || '') + (p.prenom?.[0] || '')).toUpperCase() || '?';

      const hlName = highlightMatch(fullName, currentTerms);
      const hlMat = highlightMatch(p.matricule || 'N/A', currentTerms);
      const hlSn = highlightMatch(p.sn || 'N/A', currentTerms);

      const presentAtTime = isPresentActive
        ? (isTestActive ? formatTime(p.present_at_test) : formatTime(p.present_at_info))
        : '';

      const statusPillHtml = isPresentActive
        ? `<span class="postes-status-pill online" title="Déjà marqué présent pour : ${escapeHtml(activeLabel)}">🟢 Présent (${isTestActive ? 'Test' : 'Info'})</span>`
        : `<span class="postes-status-pill offline">⚪ Non pointé</span>`;

      return `
        <div class="rc-candidate-card ${isPresentActive ? 'is-present' : ''} ${isSel ? 'sel' : ''}" data-id="${p.id}" data-idx="${idx}">
          
          <!-- Top Row: Name and Status -->
          <div class="rc-header">
            <div style="display:flex; align-items:center; gap:12px; min-width:0;">
              <div class="rc-avatar">${initials}</div>
              <div class="rc-main-info">
                <div class="rc-fullname">${hlName}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); display:flex; gap:8px; margin-top:2px;">
                  ${p.sexe ? `<span>Sexe : <strong>${escapeHtml(p.sexe)}</strong></span>` : ''}
                  ${presentAtTime ? `<span>&bull; Pointé à <strong>${presentAtTime}</strong></span>` : ''}
                </div>
              </div>
            </div>
            <div>
              ${statusPillHtml}
            </div>
          </div>

          <!-- HIGHEST VISIBILITY BLOCK: MATRICULE & NUMÉRO DE SÉRIE (SN) -->
          <div class="rc-highlight-grid">
            <div class="rc-highlight-box matricule">
              <span class="box-icon">🆔</span>
              <div class="box-content">
                <span class="box-label">MATRICULE</span>
                <span class="box-value">${hlMat}</span>
              </div>
            </div>

            <div class="rc-highlight-box sn">
              <span class="box-icon">💻</span>
              <div class="box-content">
                <span class="box-label">NUMÉRO DE SÉRIE (SN)</span>
                <span class="box-value monospace">${hlSn}</span>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="rc-action-row">
            <div style="font-size:0.82rem; color:var(--text-muted);">
              Pointage actif pour : <strong style="color:${isTestActive ? 'var(--color-success)' : 'var(--color-primary)'};">${escapeHtml(activeLabel)}</strong>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn-presence-action ${isPresentActive ? 'is-present' : 'to-mark'}" data-action="mark" data-id="${p.id}">
                ${isPresentActive ? '⚠️ Déjà présent' : '🟢 Marquer Présent'}
              </button>
              ${isPresentActive ? `<button class="btn-delete-presence" data-action="delete" data-id="${p.id}" title="Supprimer la présence enregistrée">🗑️ Supprimer</button>` : ''}
            </div>
          </div>

        </div>
      `;
    }).join('');

    // Attach click events
    resultsEl.querySelectorAll('.rc-candidate-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.getAttribute('data-id');
        const idx = parseInt(card.getAttribute('data-idx'), 10);
        selectedIndex = idx;
        updateHighlight();

        const markBtn = e.target.closest('[data-action="mark"]');
        if (markBtn) {
          e.stopPropagation();
          const target = currentResults.find(p => String(p.id) === String(id));
          if (target) initiatePresenceConfirmation(target);
          return;
        }

        const delBtn = e.target.closest('[data-action="delete"]');
        if (delBtn) {
          e.stopPropagation();
          const target = currentResults.find(p => String(p.id) === String(id));
          if (target) showDeletePresenceModal(target);
          return;
        }
      });
    });
  }

  function updateHighlight() {
    resultsEl.querySelectorAll('.rc-candidate-card').forEach((c, i) => {
      c.classList.toggle('sel', i === selectedIndex);
      if (i === selectedIndex) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  // =========================================================================
  // 🔒 FLUX DE POINTAGE SÉCURISÉ & PRÉVENTION DES DOUBLONS
  // =========================================================================

  function initiatePresenceConfirmation(person) {
    if (!person || !modalContainer) return;

    activeModalPerson = person;

    const activeDay = store.get('activeSession') || 'info';
    const isTestActive = activeDay === 'test';
    const sessionLabel = isTestActive ? 'Journée de test' : "Journée d'information";
    const isAlreadyPresent = isTestActive ? person.is_present_test === 1 : person.is_present_info === 1;

    const fullName = [person.nom, person.postnom, person.prenom].filter(Boolean).join(' ');

    // 1. DUPLICATE CHECK: If already present, show duplicate alert directly!
    if (isAlreadyPresent) {
      showDuplicateAlertModal({
        fullName,
        matricule: person.matricule || 'N/A',
        sn: person.sn || 'N/A',
        sessionLabel,
        presentAt: isTestActive ? person.present_at_test : person.present_at_info,
        presentBy: isTestActive ? person.present_by_test : person.present_by_info,
        person
      });
      return;
    }

    // 2. CONFIRMATION REQUIRED BEFORE VALIDATION
    showConfirmationModal(person, sessionLabel, fullName);
  }

  function showConfirmationModal(person, sessionLabel, fullName) {
    activeModalPerson = person;
    modalContainer.classList.remove('hidden');
    modalContainer.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="modal-header-bar confirm">
          <div class="modal-header-title">
            <span>✅</span>
            <span>Confirmation de présence</span>
          </div>
        </div>

        <!-- Body -->
        <div class="modal-body-content">
          <!-- Candidate details summary -->
          <div class="candidate-summary-box">
            <div class="candidate-summary-row">
              <span class="label">Nom complet :</span>
              <span class="val">${escapeHtml(fullName)}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">🆔 Matricule :</span>
              <span class="val highlight-mat">${escapeHtml(person.matricule || 'N/A')}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">💻 Numéro de série (SN) :</span>
              <span class="val highlight-sn">${escapeHtml(person.sn || 'N/A')}</span>
            </div>
          </div>

          <!-- Confirmation question -->
          <div class="modal-question-text" id="modal-question-target">
            Êtes-vous sûr de vouloir marquer ce candidat comme présent pour la <strong>${escapeHtml(sessionLabel)}</strong> ?
          </div>
        </div>

        <!-- Footer actions -->
        <div class="modal-footer-actions">
          <button class="btn btn-secondary" id="modal-btn-cancel">
            🔴 Annuler
          </button>
          <button class="btn btn-success" id="modal-btn-confirm" style="font-weight:800;">
            🟢 Confirmer la présence
          </button>
        </div>
      </div>
    `;

    const cancelBtn = modalContainer.querySelector('#modal-btn-cancel');
    const confirmBtn = modalContainer.querySelector('#modal-btn-confirm');

    const closeModal = () => {
      activeModalPerson = null;
      modalContainer.classList.add('hidden');
      modalContainer.innerHTML = '';
      input?.focus();
    };

    cancelBtn?.addEventListener('click', closeModal);

    confirmBtn?.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Enregistrement en cours...';

      try {
        const res = await api.confirmMarkPresence(person.id);

        if (res.alreadyPresent) {
          // Backend detected duplicate!
          showDuplicateAlertModal({
            fullName,
            matricule: person.matricule || 'N/A',
            sn: person.sn || 'N/A',
            sessionLabel: res.data?.sessionLabel || sessionLabel,
            presentAt: res.data?.rawTime || '',
            presentBy: res.data?.agentName || 'Agent'
          });
          return;
        }

        // Success!
        closeModal();

        // Update local object with full server representation
        if (res.data?.person) {
          Object.assign(person, res.data.person);
        } else {
          const activeDay = store.get('activeSession') || 'info';
          if (activeDay === 'test') {
            person.is_present_test = 1;
            person.present_at_test = new Date().toISOString();
          } else {
            person.is_present_info = 1;
            person.present_at_info = new Date().toISOString();
          }
        }

        renderResults();

        // Message de succès demandé
        const sLabel = res.data?.sessionLabel || sessionLabel;
        window.app?.showToast(
          `✅ Présence enregistrée avec succès — ${fullName} — Matricule ${person.matricule || ''} — ${sLabel}`,
          'success'
        );

        input?.focus();
        if (scannerMode) input.value = '';

      } catch (err) {
        closeModal();
        window.app?.showToast(`Erreur : ${err.message}`, 'error');
      }
    });
  }

  function showDuplicateAlertModal({ fullName, matricule, sn, sessionLabel, presentAt, presentBy, person }) {
    if (!modalContainer) return;

    const dateStr = presentAt ? presentAt.substring(0, 10).split('-').reverse().join('/') : '--';
    const timeStr = presentAt ? presentAt.substring(11, 16) : '--';

    modalContainer.classList.remove('hidden');
    modalContainer.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" style="border-color:rgba(245, 158, 11, 0.5);">
        <!-- Warning Header -->
        <div class="modal-header-bar warning">
          <div class="modal-header-title" style="color:#d97706;">
            <span>⚠️</span>
            <span>Candidat déjà marqué présent</span>
          </div>
        </div>

        <!-- Body -->
        <div class="modal-body-content">
          <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.3); padding:14px; border-radius:10px; font-weight:700; color:#d97706; text-align:center;">
            ⚠️ Ce candidat est déjà marqué présent pour la ${escapeHtml(sessionLabel)}.
          </div>

          <div class="candidate-summary-box">
            <div class="candidate-summary-row">
              <span class="label">Nom complet :</span>
              <span class="val">${escapeHtml(fullName)}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">🆔 Matricule :</span>
              <span class="val highlight-mat">${escapeHtml(matricule)}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">💻 Numéro de série (SN) :</span>
              <span class="val highlight-sn">${escapeHtml(sn)}</span>
            </div>
            <div class="candidate-summary-row" style="border-top:1px dashed var(--border-color); padding-top:8px;">
              <span class="label">📅 Date :</span>
              <span class="val" style="font-size:0.95rem;">${escapeHtml(dateStr)}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">⏰ Heure premier pointage :</span>
              <span class="val" style="font-size:0.95rem;">${escapeHtml(timeStr)}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">🏷️ Journée concernée :</span>
              <span class="val" style="font-size:0.95rem; color:var(--color-primary);">${escapeHtml(sessionLabel)}</span>
            </div>
            ${presentBy ? `
            <div class="candidate-summary-row">
              <span class="label">👤 Enregistré par :</span>
              <span class="val" style="font-size:0.95rem;">${escapeHtml(presentBy)}</span>
            </div>` : ''}
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer-actions">
          <button class="btn btn-danger" id="modal-btn-delete-presence" style="margin-right:auto;">
            🗑️ Supprimer la présence
          </button>
          <button class="btn btn-primary" id="modal-btn-close-duplicate">
            Compris / Fermer
          </button>
        </div>
      </div>
    `;

    const closeModal = () => {
      activeModalPerson = null;
      modalContainer.classList.add('hidden');
      modalContainer.innerHTML = '';
      input?.focus();
    };

    modalContainer.querySelector('#modal-btn-close-duplicate')?.addEventListener('click', closeModal);

    modalContainer.querySelector('#modal-btn-delete-presence')?.addEventListener('click', () => {
      closeModal();
      if (person || activeModalPerson) showDeletePresenceModal(person || activeModalPerson);
    });
  }

  // =========================================================================
  // 🗑️ SUPPRESSION DE PRÉSENCE — avec sélection du jour et confirmation
  // =========================================================================

  function showDeletePresenceModal(person) {
    if (!person || !modalContainer) return;
    activeModalPerson = person;

    const fullName = [person.nom, person.postnom, person.prenom].filter(Boolean).join(' ');
    const hasPresentInfo = person.is_present_info === 1;
    const hasPresentTest = person.is_present_test === 1;

    if (!hasPresentInfo && !hasPresentTest) {
      window.app?.showToast('Ce candidat n\'est présent dans aucune journée.', 'warning');
      return;
    }

    const infoTimeStr = person.present_at_info ? person.present_at_info.substring(11, 16) : '';
    const testTimeStr = person.present_at_test ? person.present_at_test.substring(11, 16) : '';

    modalContainer.classList.remove('hidden');
    modalContainer.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" style="border-color:rgba(239,68,68,0.4);">
        <div class="modal-header-bar" style="background:rgba(239,68,68,0.12);">
          <div class="modal-header-title" style="color:#ef4444;">
            <span>🗑️</span>
            <span>Supprimer une présence</span>
          </div>
        </div>

        <div class="modal-body-content">
          <div class="candidate-summary-box" style="margin-bottom:16px;">
            <div class="candidate-summary-row">
              <span class="label">Candidat :</span>
              <span class="val" style="font-weight:800;">${escapeHtml(fullName)}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">🆔 Matricule :</span>
              <span class="val highlight-mat">${escapeHtml(person.matricule || 'N/A')}</span>
            </div>
            <div class="candidate-summary-row">
              <span class="label">💻 Numéro de série (SN) :</span>
              <span class="val highlight-sn">${escapeHtml(person.sn || 'N/A')}</span>
            </div>
          </div>

          <div style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px;">
            Choisissez la journée à annuler :
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
            ${hasPresentInfo ? `
            <label style="display:flex; align-items:center; gap:12px; padding:12px 16px; background:rgba(79,142,247,0.08); border:1.5px solid rgba(79,142,247,0.25); border-radius:10px; cursor:pointer;">
              <input type="radio" name="delete-day" value="info" id="del-radio-info" style="cursor:pointer; width:16px; height:16px;">
              <div>
                <div style="font-weight:700; color:var(--color-primary);">📢 Journée d'information</div>
                ${infoTimeStr ? `<div style="font-size:0.75rem; color:var(--text-muted);">Pointé à ${infoTimeStr}${person.present_by_info ? ' par ' + escapeHtml(person.present_by_info) : ''}</div>` : ''}
              </div>
            </label>` : ''}

            ${hasPresentTest ? `
            <label style="display:flex; align-items:center; gap:12px; padding:12px 16px; background:rgba(34,197,94,0.08); border:1.5px solid rgba(34,197,94,0.25); border-radius:10px; cursor:pointer;">
              <input type="radio" name="delete-day" value="test" id="del-radio-test" style="cursor:pointer; width:16px; height:16px;">
              <div>
                <div style="font-weight:700; color:var(--color-success);">📝 Journée de test</div>
                ${testTimeStr ? `<div style="font-size:0.75rem; color:var(--text-muted);">Pointé à ${testTimeStr}${person.present_by_test ? ' par ' + escapeHtml(person.present_by_test) : ''}</div>` : ''}
              </div>
            </label>` : ''}

            ${(hasPresentInfo && hasPresentTest) ? `
            <label style="display:flex; align-items:center; gap:12px; padding:12px 16px; background:rgba(239,68,68,0.07); border:1.5px solid rgba(239,68,68,0.2); border-radius:10px; cursor:pointer;">
              <input type="radio" name="delete-day" value="both" id="del-radio-both" style="cursor:pointer; width:16px; height:16px;">
              <div>
                <div style="font-weight:700; color:var(--color-danger);">🗑️ Supprimer les deux journées</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Annuler Info + Test</div>
              </div>
            </label>` : ''}
          </div>

          <div style="margin-top:14px; padding:10px 14px; background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.2); border-radius:8px; font-size:0.8rem; color:var(--color-danger);">
            ⚠️ Cette action supprime le pointage enregistré. Elle peut être refaite à tout moment.
          </div>
        </div>

        <div class="modal-footer-actions">
          <button class="btn btn-secondary" id="del-modal-cancel">Annuler</button>
          <button class="btn btn-danger" id="del-modal-confirm" disabled>🗑️ Confirmer la suppression</button>
        </div>
      </div>
    `;

    const closeModal = () => {
      activeModalPerson = null;
      modalContainer.classList.add('hidden');
      modalContainer.innerHTML = '';
      input?.focus();
    };

    const confirmBtn = modalContainer.querySelector('#del-modal-confirm');

    // Enable confirm button when a radio is selected
    modalContainer.querySelectorAll('input[name="delete-day"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (confirmBtn) confirmBtn.disabled = false;
      });
    });

    // Pre-select if only one option
    if (hasPresentInfo && !hasPresentTest) {
      const r = modalContainer.querySelector('#del-radio-info');
      if (r) { r.checked = true; if (confirmBtn) confirmBtn.disabled = false; }
    } else if (!hasPresentInfo && hasPresentTest) {
      const r = modalContainer.querySelector('#del-radio-test');
      if (r) { r.checked = true; if (confirmBtn) confirmBtn.disabled = false; }
    }

    modalContainer.querySelector('#del-modal-cancel')?.addEventListener('click', closeModal);

    confirmBtn?.addEventListener('click', async () => {
      const selected = modalContainer.querySelector('input[name="delete-day"]:checked');
      if (!selected) return;
      const day = selected.value;

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Suppression...';

      try {
        if (day === 'both') {
          await api.togglePresence(person.id, 'info', 0);
          await api.togglePresence(person.id, 'test', 0);
          person.is_present_info = 0;
          person.present_at_info = null;
          person.is_present_test = 0;
          person.present_at_test = null;
          window.app?.showToast(`🗑️ Présences supprimées (Info + Test) — ${fullName}`, 'info');
        } else {
          await api.togglePresence(person.id, day, 0);
          const label = day === 'test' ? 'Journée de test' : "Journée d'information";
          if (day === 'info') { person.is_present_info = 0; person.present_at_info = null; }
          else { person.is_present_test = 0; person.present_at_test = null; }
          window.app?.showToast(`🗑️ Présence supprimée (${label}) — ${fullName}`, 'info');
        }

        closeModal();
        renderResults();
      } catch (err) {
        window.app?.showToast(`Erreur : ${err.message}`, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🗑️ Confirmer la suppression';
      }
    });
  }

  // =========================================================================
  // 🔄 GESTION DU CHANGEMENT DE JOURNÉE SANS PERTE DE SAISIE NI CONFLIT
  // =========================================================================

  function onSessionChanged(newSession, newLabel) {
    const isTest = newSession === 'test';
    const label = newLabel || (isTest ? 'Journée de test' : "Journée d'information");

    // 1. Mise à jour des boutons Admin
    const btnInfo = container.querySelector('#session-btn-info');
    const btnTest = container.querySelector('#session-btn-test');
    if (btnInfo && btnTest) {
      btnInfo.className = `session-btn ${!isTest ? 'active-info' : ''}`;
      btnInfo.innerHTML = `<span>📢</span><span>Journée d'information</span>${!isTest ? '<span class="active-check">✓</span>' : ''}`;
      btnTest.className = `session-btn ${isTest ? 'active-test' : ''}`;
      btnTest.innerHTML = `<span>📝</span><span>Journée de test</span>${isTest ? '<span class="active-check">✓</span>' : ''}`;
    }

    // 2. Mise à jour du badge Admin
    const badge = container.querySelector('#session-active-badge');
    if (badge) {
      badge.className = `session-badge ${newSession}`;
      badge.textContent = isTest ? '📝 Test actif' : '📢 Info active';
    }

    // 3. Mise à jour du badge Client
    const clientBadge = container.querySelector('#client-day-badge');
    if (clientBadge) {
      clientBadge.innerHTML = `
        <span class="day-icon">${isTest ? '📝' : '📢'}</span>
        <div>
          <div class="day-title">
            Journée active : <strong style="color:${isTest ? 'var(--color-success)' : 'var(--color-primary)'};">${escapeHtml(label)}</strong>
          </div>
          <div class="day-sub">
            🔒 Définie par l'Administrateur &bull; Tous vos pointages seront enregistrés pour cette séance
          </div>
        </div>
      `;
    }

    // 4. Mise à jour de l'état d'affichage des résultats (sans effacer la saisie de l'input)
    if (currentResults.length > 0) {
      renderResults();
    } else {
      const emptySessionName = container.querySelector('#empty-state-session-name');
      if (emptySessionName) {
        emptySessionName.textContent = label;
        emptySessionName.style.color = isTest ? 'var(--color-success)' : 'var(--color-primary)';
      }
    }

    // 5. Mise à jour de la modale ouverte si active
    if (activeModalPerson && modalContainer && !modalContainer.classList.contains('hidden')) {
      const isAlready = isTest ? activeModalPerson.is_present_test === 1 : activeModalPerson.is_present_info === 1;
      const fullName = [activeModalPerson.nom, activeModalPerson.postnom, activeModalPerson.prenom].filter(Boolean).join(' ');
      if (isAlready) {
        showDuplicateAlertModal({
          fullName,
          matricule: activeModalPerson.matricule || 'N/A',
          sn: activeModalPerson.sn || 'N/A',
          sessionLabel: label,
          presentAt: isTest ? activeModalPerson.present_at_test : activeModalPerson.present_at_info,
          presentBy: isTest ? activeModalPerson.present_by_test : activeModalPerson.present_by_info
        });
      } else {
        const qTarget = modalContainer.querySelector('#modal-question-target');
        if (qTarget) {
          qTarget.innerHTML = `Êtes-vous sûr de vouloir marquer ce candidat comme présent pour la <strong>${escapeHtml(label)}</strong> ?`;
        }
      }
    }
  }

  // Real-time synchronization
  const unbindWs = api.on('presence_updated', (data) => {
    if (data?.person) {
      const match = currentResults.find(p => p.id === data.person.id);
      if (match) {
        Object.assign(match, {
          is_present_info: data.person.is_present_info,
          present_at_info: data.person.present_at_info,
          present_by_info: data.person.present_by_info,
          is_present_test: data.person.is_present_test,
          present_at_test: data.person.present_at_test,
          present_by_test: data.person.present_by_test,
        });
        renderResults();
      }
      if (data.stats) updateStats(data.stats);
    }
  });

  const unbindStats = store.on('stats', (s) => updateStats(s));

  const unbindSession = api.on('session_day_changed', (data) => {
    onSessionChanged(data.activeDay, data.label);
  });

  function updateStats(s) {
    if (!s) return;
    const vals = {
      'sp-total': s.total ?? 0,
      'sp-info': s.presentInfo ?? 0,
      'sp-test': s.presentTest ?? 0,
      'sp-both': s.presentBoth ?? 0,
      'sp-info-rate': `${s.rateInfo ?? 0}%`,
      'sp-test-rate': `${s.rateTest ?? 0}%`,
    };
    for (const [id, val] of Object.entries(vals)) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    const banner = container.querySelector('#no-data-banner');
    if (banner) {
      banner.style.display = (s.total ?? 0) > 0 ? 'none' : 'flex';
    }
  }

  container._cleanup = () => {
    unbindWs();
    unbindStats();
    unbindSession();
  };

  return {
    onSessionChanged
  };
}
