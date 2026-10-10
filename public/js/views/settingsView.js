import { store } from '../state.js';
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export function renderSettingsView(container) {
  // If not authenticated as admin, show login prompt
  if (!store.get('isAdmin')) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:65vh;gap:20px;text-align:center;padding:24px;">
        <div style="font-size:3.5rem;">🔒</div>
        <h2 style="font-size:1.5rem;font-weight:800;color:var(--text-main);margin:0;">Authentification Administrateur Requise</h2>
        <p style="color:var(--text-muted);max-width:440px;line-height:1.6;margin:0;">
          Cette section contient les paramètres de sécurité, les sauvegardes et la gestion du réseau.
          Veuillez saisir le mot de passe administrateur pour déverrouiller l'accès.
        </p>

        <form id="admin-login-form" style="display:flex;flex-direction:column;gap:14px;width:100%;max-width:340px;margin-top:8px;">
          <input
            type="password"
            id="admin-password-input"
            class="filter-input"
            placeholder="Mot de passe administrateur"
            required
            autocomplete="current-password"
            style="padding:12px 16px;font-size:0.95rem;text-align:center;"
          />
          <button type="submit" class="btn btn-primary" id="btn-admin-login-submit" style="padding:12px;font-weight:700;">
            🔓 Déverrouiller l'Administration
          </button>
          <div id="login-error-msg" style="color:var(--color-danger);font-size:0.85rem;display:none;"></div>
        </form>
      </div>
    `;

    const form = container.querySelector('#admin-login-form');
    const pwdInput = container.querySelector('#admin-password-input');
    const submitBtn = container.querySelector('#btn-admin-login-submit');
    const errorMsg = container.querySelector('#login-error-msg');

    setTimeout(() => pwdInput?.focus(), 100);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = (pwdInput?.value || '').trim();
      if (!pwd) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Vérification...';
      errorMsg.style.display = 'none';

      try {
        await api.loginAdmin(pwd);
        window.app?.showToast('🔑 Session administrateur activée avec succès', 'success');
        // Refresh settings view with admin access
        renderSettingsView(container);
      } catch (err) {
        errorMsg.textContent = err.message || 'Mot de passe incorrect.';
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '🔓 Déverrouiller l\'Administration';
        pwdInput.select();
      }
    });

    return;
  }

  const lan = store.get('lanInfo') || {};
  const agentName = store.get('agentName');
  const soundEnabled = store.get('soundEnabled');
  const theme = store.get('theme');

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-group">
        <h1>
          <span>⚙️ Paramètres &amp; Administration</span>
        </h1>
        <p>Configuration du poste hôte, connectivité réseau, sécurité et maintenance</p>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span class="role-badge role-admin" style="font-size:0.75rem;padding:6px 14px;">👑 SESSION ADMIN ACTIVE</span>
        <button class="btn btn-secondary btn-sm" id="btn-admin-logout" style="border-color:rgba(239,68,68,0.4);color:var(--color-danger);">
          🚪 Déconnexion
        </button>
      </div>
    </div>

    <div class="settings-grid">

      <!-- LAN Network Collaboration Card -->
      <div class="kpi-card" style="padding: 24px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>🌐 Travail Collaboratif Hors-Ligne (LAN)</span>
        </h3>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 16px;">
          Ce système fonctionne <strong>100% hors-ligne sans connexion Internet</strong>. Partagez cette adresse avec les 50 autres postes connectés sur le même réseau local :
        </p>
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <input
            type="text"
            readonly
            class="filter-input"
            style="flex: 1; font-family: var(--font-mono); font-weight: 700; color: var(--color-primary); font-size: 1rem;"
            value="${escapeHtml(lan.lanUrl || 'http://localhost:3000')}"
            id="settings-lan-url"
          />
          <button class="btn btn-primary btn-sm" id="btn-copy-settings-lan">Copier l'adresse</button>
        </div>
        <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
          ℹ️ <strong>Instructions :</strong><br>
          1. Ouvrez Google Chrome ou Edge sur les autres PC.<br>
          2. Saisissez l'adresse ci-dessus dans la barre de navigation.<br>
          3. Tous les pointages se synchronisent instantanément en direct via WebSockets.
        </div>
      </div>

      <!-- Station Identity Card -->
      <div class="kpi-card" style="padding: 24px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>💻 Nom de ce Poste</span>
        </h3>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 16px;">
          Identifiant affiché dans le journal d'audit lors des enregistrements de présence :
        </p>
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <input
            type="text"
            class="filter-input"
            style="flex: 1; font-weight: 600;"
            value="${escapeHtml(agentName || 'Poste 01')}"
            id="settings-agent-name-input"
            maxlength="64"
          />
          <button class="btn btn-secondary btn-sm" id="btn-save-agent-name">Enregistrer</button>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted);">
          Exemples : <code>Poste Entrée Nord</code>, <code>Table 03</code>, <code>Agent Sarah</code>
        </p>
      </div>

      <!-- Security Card: Password Management -->
      <div class="kpi-card" style="padding: 24px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>🔐 Sécurité du Compte Administrateur</span>
        </h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 14px;">
          Modifiez le mot de passe maître pour empêcher tout accès non autorisé aux fonctions sensibles :
        </p>
        <form id="form-change-password" style="display: flex; flex-direction: column; gap: 10px;">
          <input
            type="password"
            id="input-cur-pwd"
            class="filter-input"
            placeholder="Mot de passe actuel"
            required
            autocomplete="current-password"
            style="font-size:0.85rem;"
          />
          <input
            type="password"
            id="input-new-pwd"
            class="filter-input"
            placeholder="Nouveau mot de passe (min. 6 caractères)"
            required
            autocomplete="new-password"
            minlength="6"
            style="font-size:0.85rem;"
          />
          <button type="submit" class="btn btn-secondary btn-sm" id="btn-save-pwd" style="align-self: flex-start;">
            Enregistrer le nouveau mot de passe
          </button>
        </form>
      </div>

      <!-- Preferences Card -->
      <div class="kpi-card" style="padding: 24px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>🎨 Préférences Visuelles &amp; Audio</span>
        </h3>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
            <input type="checkbox" id="settings-sound-check" ${soundEnabled ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--color-primary);" />
            <div>
              <div style="font-weight: 600; font-size: 0.92rem;">Effets sonores (Bips audio Web Audio)</div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">Retour sonore discret lors du pointage de présence</div>
            </div>
          </label>

          <div>
            <div style="font-weight: 600; font-size: 0.92rem; margin-bottom: 6px;">Thème de l'interface</div>
            <select id="settings-theme-select" class="filter-select" style="width: 100%;">
              <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Mode Sombre (Recommandé)</option>
              <option value="light" ${theme === 'light' ? 'selected' : ''}>Mode Clair</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Connected Workstations Panel -->
      <div class="kpi-card" style="padding: 24px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>📱 Postes Clients Connectés</span>
          <button class="btn btn-ghost btn-sm" id="btn-refresh-workstations" style="margin-left:auto;font-size:0.75rem;padding:4px 8px;">Actualiser</button>
        </h3>
        <div id="workstations-list" style="min-height:60px;">
          <div style="color:var(--text-muted);font-size:0.85rem;">Chargement...</div>
        </div>
      </div>

      <!-- Database Maintenance & Atomic Backups Card -->
      <div class="kpi-card" style="padding: 24px; grid-column: 1 / -1;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; color: var(--text-main);">
          💾 Maintenance &amp; Intégrité de la Base de Données
        </h3>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
          <button class="btn btn-secondary" id="btn-backup-db">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Télécharger la Sauvegarde Cohérente (.db)
          </button>

          <label class="btn btn-secondary" style="cursor:pointer;margin:0;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Restaurer une Sauvegarde (.db)
            <input type="file" id="input-restore-file" accept=".db" style="display:none;" />
          </label>

          <button class="btn btn-secondary" id="btn-reset-presence" style="border-color: rgba(245, 158, 11, 0.4); color: var(--color-warning);">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 0115.54-6.36L21 8M21 3v5h-5"/>
              <path d="M21 12a9 9 0 01-15.54 6.36L3 16M3 21v-5h5"/>
            </svg>
            Remettre les présences à zéro (Nouvelle séance)
          </button>

          <button class="btn btn-danger" id="btn-clear-all-data">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            </svg>
            Vider entièrement la base de données
          </button>
        </div>
        <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">
          🔒 Les sauvegardes utilisent <code>VACUUM INTO</code> avec synchronisation préalable du journal WAL pour garantir 100% de cohérence sans perte de données.
        </p>
      </div>

    </div>
  `;

  // Admin Logout Handler
  container.querySelector('#btn-admin-logout')?.addEventListener('click', async () => {
    await api.logoutAdmin();
    window.app?.showToast('Session administrateur fermée.', 'info');
    renderSettingsView(container);
  });

  // Change Password Form
  container.querySelector('#form-change-password')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = container.querySelector('#input-cur-pwd')?.value || '';
    const next = container.querySelector('#input-new-pwd')?.value || '';
    const btn = container.querySelector('#btn-save-pwd');

    if (!cur || !next) return;
    btn.disabled = true;
    btn.textContent = 'Enregistrement...';

    try {
      await api.changePassword(cur, next);
      window.app?.showToast('🔒 Mot de passe administrateur modifié avec succès !', 'success');
      container.querySelector('#input-cur-pwd').value = '';
      container.querySelector('#input-new-pwd').value = '';
    } catch (err) {
      window.app?.showToast(`Erreur : ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enregistrer le nouveau mot de passe';
    }
  });

  // LAN Copy Handler
  container.querySelector('#btn-copy-settings-lan')?.addEventListener('click', () => {
    const input = container.querySelector('#settings-lan-url');
    if (input) {
      navigator.clipboard.writeText(input.value);
      window.app.showToast('Lien réseau copié !', 'info');
    }
  });

  // Save Agent Name Handler
  container.querySelector('#btn-save-agent-name')?.addEventListener('click', () => {
    const nameInput = container.querySelector('#settings-agent-name-input');
    const val = (nameInput?.value || '').trim() || 'Poste 01';
    store.setAgentName(val);
    document.getElementById('display-agent-name').textContent = val;
    window.app.showToast('Poste identifié sous : "' + val + '"', 'success');
  });

  // Sound Check Handler
  container.querySelector('#settings-sound-check')?.addEventListener('change', (e) => {
    localStorage.setItem('sound_enabled', e.target.checked);
    store.set('soundEnabled', e.target.checked);
    window.app.showToast(e.target.checked ? 'Retour sonore activé' : 'Retour sonore désactivé', 'info');
  });

  // Theme Select Handler
  container.querySelector('#settings-theme-select')?.addEventListener('change', (e) => {
    store.setTheme(e.target.value);
  });

  // Backup DB
  container.querySelector('#btn-backup-db')?.addEventListener('click', () => {
    const token = sessionStorage.getItem('easypresence_admin_token') || '';
    window.location.href = `/api/system/backup?admin_token=${encodeURIComponent(token)}`;
    window.app.showToast('Téléchargement de la base de données...', 'info');
  });

  // Restore DB File Handler
  container.querySelector('#input-restore-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ok = confirm(`Voulez-vous vraiment restaurer la base de données depuis "${file.name}" ?\nUne sauvegarde de secours des données actuelles sera automatiquement générée.`);
    if (!ok) {
      e.target.value = '';
      return;
    }

    window.app.showToast('Restauration de la base en cours...', 'info');
    try {
      const res = await api.restoreBackup(file);
      window.app.showToast(`✅ ${res.message}`, 'success');
    } catch (err) {
      window.app.showToast(`Erreur lors de la restauration : ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  });

  // Reset Presence
  container.querySelector('#btn-reset-presence')?.addEventListener('click', async () => {
    const ok = confirm('Êtes-vous sûr de vouloir réinitialiser toutes les présences ?');
    if (!ok) return;
    try {
      await api.resetAllAttendance();
      window.app.showToast('Toutes les présences ont été remises à zéro !', 'success');
    } catch (err) {
      window.app.showToast(err.message, 'error');
    }
  });

  // Clear All
  container.querySelector('#btn-clear-all-data')?.addEventListener('click', async () => {
    const ok = confirm('ATTENTION : Voulez-vous vraiment TOUT effacer ? Cette action est irréversible.');
    if (!ok) return;
    try {
      await api.clearAllData();
      window.app.showToast('Toutes les données ont été effacées.', 'info');
    } catch (err) {
      window.app.showToast(err.message, 'error');
    }
  });

  // Load workstations list with strict HTML sanitization
  const loadWorkstations = async () => {
    const el = container.querySelector('#workstations-list');
    if (!el) return;
    try {
      const list = await api.fetchWorkstations();
      if (!list || list.length === 0) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;font-style:italic;">Aucun poste client enregistré pour l\'instant.</div>';
        return;
      }
      el.innerHTML = list.map(ws => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
          <span style="font-size:1rem;">💻</span>
          <div>
            <div style="font-weight:600;font-size:0.85rem;color:var(--text-main);">${escapeHtml(ws.name || '(Sans nom)')}</div>
            <div style="font-size:0.73rem;color:var(--text-muted);font-family:var(--font-mono);">${escapeHtml(ws.ip)}</div>
          </div>
          <span class="role-badge role-client" style="margin-left:auto;">${escapeHtml(ws.role || 'CLIENT')}</span>
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = `<div style="color:var(--color-warning);font-size:0.83rem;">${escapeHtml(err.message || 'Impossible de charger les postes.')}</div>`;
    }
  };

  loadWorkstations();
  container.querySelector('#btn-refresh-workstations')?.addEventListener('click', loadWorkstations);

  // Live update when a workstation registers itself
  const unsubWs = api.on('workstation_updated', () => loadWorkstations());
  container._cleanup = () => unsubWs();
}
