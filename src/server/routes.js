import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getStats,
  searchPersons,
  getPersonsList,
  togglePresence,
  bulkMarkPresence,
  resetAllAttendance,
  clearAllData,
  getHistory,
  getImportedBatches,
  deleteImportedBatch,
  getSetting,
  setSetting,
  getActiveDay,
  setActiveDay,
  getPersonPresenceDetails,
  createDatabaseBackup,
  restoreDatabaseBackup
} from './db.js';
import { analyzeExcelBuffer, executeImport } from './excelParser.js';
import { runExportAsync } from './exportService.js';
import { getLocalIpAddresses, getPrimaryLanIp } from './network.js';
import {
  broadcast,
  getActiveClientCount,
  getConnectedClientsList,
  setStationName,
  recordClientActivity,
  broadcastClientsList
} from './websocket.js';
import {
  requireAdmin,
  loginAdmin,
  logoutAdmin,
  changeAdminPassword,
  getRealSocketIp,
  verifyAdminRequest
} from './auth.js';
import {
  apiLimiter,
  authLimiter,
  exportLimiter
} from './rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ---------------------------------------------------------------------------
// 🔐 AUTHENTICATION & ACCESS CONTROL (CRITICAL SECURITY)
// ---------------------------------------------------------------------------

/** POST /api/auth/login — Authenticates admin with password */
router.post('/auth/login', authLimiter, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Mot de passe requis.' });
    }
    const realIp = getRealSocketIp(req);
    const authResult = loginAdmin(password, realIp);
    res.json({
      success: true,
      message: 'Authentification administrateur réussie.',
      ...authResult
    });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

/** POST /api/auth/logout — Invalidates admin session token */
router.post('/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  }
  logoutAdmin(token);
  res.json({ success: true, message: 'Déconnexion administrateur réussie.' });
});

/** POST /api/auth/change-password — ADMIN ONLY: change admin password */
router.post('/auth/change-password', requireAdmin, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    changeAdminPassword(currentPassword, newPassword);
    res.json({ success: true, message: 'Mot de passe administrateur modifié avec succès.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/role — Called by frontend on startup and view changes.
 * Returns whether the active request is authenticated as admin.
 * Also returns isHostMachine purely as informational indicator.
 */
router.get('/auth/role', (req, res) => {
  const realIp = getRealSocketIp(req);
  const isAdmin = verifyAdminRequest(req);
  const isLocalhost = realIp === '127.0.0.1' || realIp === 'localhost';
  const primaryIp = getPrimaryLanIp();
  const port = process.env.PORT || 3000;

  res.json({
    success: true,
    data: {
      role: isAdmin ? 'admin' : 'client',
      isAdmin,
      isHostMachine: isLocalhost,
      hostIp: primaryIp,
      port
    }
  });
});

// ---------------------------------------------------------------------------
// 🖥️ CLIENT WORKSTATION NAME & ACTIVITY TRACKING
// ---------------------------------------------------------------------------

/** Returns the verified socket client IP. */
function getClientIp(req) {
  return getRealSocketIp(req);
}

function getReqClientId(req) {
  return req.headers['x-client-id'] || getRealSocketIp(req);
}

function getReqDeviceInfo(req) {
  try {
    const raw = req.headers['x-device-info'];
    if (raw) return JSON.parse(decodeURIComponent(raw));
  } catch (_) {}
  return null;
}

/** GET /api/client/name — returns the saved name for this workstation */
router.get('/client/name', (req, res) => {
  const clientId = getReqClientId(req);
  const ip = getClientIp(req);
  recordClientActivity(clientId, null, ip, getReqDeviceInfo(req));
  const clients = getConnectedClientsList();
  const station = clients.find(c => c.id === clientId || c.ip === ip);
  res.json({ success: true, data: { name: station?.name || null, ip, clientId } });
});

/** POST /api/client/name — saves / updates the workstation name */
router.post('/client/name', (req, res) => {
  const clientId = getReqClientId(req);
  const ip = getClientIp(req);
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Nom du poste invalide.' });
  }
  const safe = name.trim().substring(0, 64);
  setStationName(clientId, safe);

  broadcast({
    type: 'WORKSTATION_UPDATED',
    data: { clientId, ip, name: safe }
  });

  res.json({ success: true, data: { name: safe, ip, clientId } });
});

/** GET /api/admin/clients — admin only: full real-time list of workstations */
router.get('/admin/clients', requireAdmin, (req, res) => {
  const list = getConnectedClientsList();
  res.json({ success: true, data: list });
});

/** GET /api/admin/workstations — alias for compatibility */
router.get('/admin/workstations', requireAdmin, (req, res) => {
  const list = getConnectedClientsList();
  res.json({ success: true, data: list });
});

// ---------------------------------------------------------------------------
// 📅 ACTIVE SESSION DAY — Single Central Source of Truth (ADMIN CONTROLLED)
// ---------------------------------------------------------------------------

/** GET /api/session/active — public: current active day selected by Admin */
router.get('/session/active', (req, res) => {
  const day = getActiveDay();
  const label = day === 'test' ? 'Journée de test' : "Journée d'information";
  res.json({
    success: true,
    data: {
      activeDay: day,
      label
    }
  });
});

/** POST /api/session/active — ADMIN ONLY: change the active session day */
router.post('/session/active', requireAdmin, (req, res) => {
  const { activeDay } = req.body;
  if (activeDay !== 'info' && activeDay !== 'test') {
    return res.status(400).json({
      success: false,
      error: 'Journée invalide. Utilisez "info" pour Journée d\'information ou "test" pour Journée de test.'
    });
  }

  const saved = setActiveDay(activeDay);
  const label = saved === 'test' ? 'Journée de test' : "Journée d'information";

  // Broadcast immediate change to ALL connected client machines
  broadcast({
    type: 'SESSION_DAY_CHANGED',
    data: {
      activeDay: saved,
      label
    }
  });

  res.json({
    success: true,
    message: `Journée active changée avec succès : ${label}`,
    data: {
      activeDay: saved,
      label
    }
  });
});

// Memory storage for multer so we can parse buffer directly without temp file leaks
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// Cache uploaded buffers temporarily by session id for preview -> confirm workflow
const uploadSessions = new Map();

// Periodic cleanup of upload sessions older than 30 mins
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of uploadSessions.entries()) {
    if (now - value.timestamp > 30 * 60 * 1000) {
      uploadSessions.delete(key);
    }
  }
}, 5 * 60 * 1000);

// --- Stats Endpoint ---
router.get('/stats', (req, res) => {
  try {
    const stats = getStats();
    stats.activeClients = getActiveClientCount();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Search Endpoint (< 5ms) ---
router.get('/search', (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit, 10) || 50;
    recordClientActivity(getReqClientId(req), null, getClientIp(req), getReqDeviceInfo(req));
    const results = searchPersons(q, limit);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Persons List Endpoint (paginated, filters) ---
router.get('/persons', (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const statusInfo = req.query.statusInfo || 'all';
    const statusTest = req.query.statusTest || 'all';
    const statusCombo = req.query.statusCombo || 'all';
    const sexe = req.query.sexe || 'all';
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'id';
    const sortOrder = req.query.sortOrder || 'ASC';

    const result = getPersonsList({ page, limit, statusInfo, statusTest, statusCombo, sexe, search, sortBy, sortOrder });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Secure Presence Mark with Duplicate Prevention ---
router.post('/presence/confirm-mark', (req, res) => {
  try {
    const { id, agentName } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    // Central active day set by Admin is strictly enforced
    const activeDay = getActiveDay();
    const sessionLabel = activeDay === 'test' ? 'Journée de test' : "Journée d'information";

    const ip = getClientIp(req);
    recordClientActivity(getReqClientId(req), agentName, ip, getReqDeviceInfo(req));

    // Verify if candidate is already marked present for the active day
    const details = getPersonPresenceDetails(id, activeDay);
    if (!details || !details.person) {
      return res.status(404).json({ success: false, error: 'Candidat introuvable.' });
    }

    if (details.isPresent) {
      const p = details.person;
      const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
      const markedAt = details.presentAt || details.historyRecord?.action_time || '';
      const markedDate = markedAt ? markedAt.substring(0, 10).split('-').reverse().join('/') : '--';
      const markedTime = markedAt ? markedAt.substring(11, 16) : '--';
      const firstAgent = details.presentBy || details.historyRecord?.agent_name || 'Agent';

      return res.status(200).json({
        success: false,
        alreadyPresent: true,
        error: `Ce candidat est déjà marqué présent pour la ${sessionLabel}.`,
        data: {
          person: {
            id: p.id,
            nom: p.nom,
            postnom: p.postnom,
            prenom: p.prenom,
            fullName,
            matricule: p.matricule || 'N/A',
            sn: p.sn || 'N/A'
          },
          sessionType: activeDay,
          sessionLabel,
          date: markedDate,
          time: markedTime,
          rawTime: markedAt,
          agentName: firstAgent
        }
      });
    }

    // Not present yet -> mark as present for the active session day
    const result = togglePresence(id, activeDay, 1, agentName || 'Agent', ip);

    // Broadcast change to all connected stations on the network
    broadcast({
      type: 'PRESENCE_UPDATED',
      data: {
        person: result.person,
        sessionType: activeDay,
        stats: result.stats
      }
    });

    const p = result.person;
    const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');

    res.json({
      success: true,
      alreadyPresent: false,
      message: `Présence enregistrée avec succès : ${fullName}`,
      data: {
        person: result.person,
        fullName,
        matricule: p.matricule || 'N/A',
        sn: p.sn || 'N/A',
        sessionType: activeDay,
        sessionLabel,
        stats: result.stats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Presence Toggle Endpoint (Legacy & manual undo support) ---
router.post('/presence/toggle', (req, res) => {
  try {
    const { id, sessionType = 'info', status, agentName } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID requis' });

    const ip = getClientIp(req);
    recordClientActivity(getReqClientId(req), agentName, ip, getReqDeviceInfo(req));
    const result = togglePresence(id, sessionType, status !== undefined ? status : null, agentName, ip);

    // Broadcast change to all connected stations on the network
    broadcast({
      type: 'PRESENCE_UPDATED',
      data: {
        person: result.person,
        sessionType: result.sessionType,
        stats: result.stats
      }
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Presence Bulk Mark Endpoint ---
router.post('/presence/bulk', (req, res) => {
  try {
    const { ids, sessionType = 'info', isPresent, agentName } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Liste d\'identifiants requise' });
    }

    const ip = getClientIp(req);
    recordClientActivity(getReqClientId(req), agentName, ip, getReqDeviceInfo(req));
    const result = bulkMarkPresence(ids, sessionType, isPresent, agentName, ip);

    broadcast({
      type: 'BULK_PRESENCE_UPDATED',
      data: {
        updated: result.updated,
        sessionType: result.sessionType,
        stats: result.stats
      }
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Reset All Presence Statuses (ADMIN ONLY) ---
router.post('/presence/reset', requireAdmin, (req, res) => {
  try {
    const { sessionType = 'all', agentName } = req.body;
    const stats = resetAllAttendance(sessionType, agentName || 'Admin');

    broadcast({
      type: 'ATTENDANCE_RESET',
      data: { sessionType, stats }
    });

    res.json({ success: true, message: `Les présences (${sessionType}) ont été réinitialisées.`, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Excel Preview & Column Analysis (ADMIN ONLY) ---
router.post('/excel/preview', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Veuillez sélectionner un fichier Excel valide.' });
    }

    const analysis = analyzeExcelBuffer(req.file.buffer);

    // Store buffer in session map for confirmation
    const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    uploadSessions.set(sessionId, {
      buffer: req.file.buffer,
      filename: req.file.originalname,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      sessionId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      analysis
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Confirm Excel Import (ADMIN ONLY) ---
router.post('/excel/confirm-import', requireAdmin, (req, res) => {
  try {
    const { sessionId, mapping, updateDuplicates } = req.body;
    if (!sessionId || !uploadSessions.has(sessionId)) {
      return res.status(400).json({ success: false, error: 'Session d\'importation expirée ou introuvable.' });
    }

    const session = uploadSessions.get(sessionId);
    const result = executeImport({
      buffer: session.buffer,
      filename: session.filename || 'Fichier Excel',
      mapping: mapping || {},
      updateDuplicates: Boolean(updateDuplicates)
    });

    // Cleanup session buffer
    uploadSessions.delete(sessionId);

    // Broadcast data imported to all network nodes
    broadcast({
      type: 'DATA_IMPORTED',
      data: { stats: result.stats }
    });

    res.json({
      success: true,
      message: `${result.inserted} personnes importées avec succès (${result.updated} mises à jour, ${result.skipped} ignorées).`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- List Imported Excel Files (ADMIN ONLY) ---
router.get('/excel/files', requireAdmin, (req, res) => {
  try {
    const files = getImportedBatches();
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Delete an Imported Excel File and its Persons (ADMIN ONLY) ---
router.delete('/excel/files/:id', requireAdmin, (req, res) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (!batchId) return res.status(400).json({ success: false, error: 'ID de fichier invalide.' });

    const result = deleteImportedBatch(batchId);

    // Broadcast change to all stations
    broadcast({
      type: 'DATA_CHANGED',
      data: { stats: result.stats }
    });

    res.json({
      success: true,
      message: `Le fichier "${result.filename}" a été supprimé (${result.deletedCount} personne(s) retirée(s)).`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Audit History Endpoint (ADMIN ONLY) ---
router.get('/history', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const data = getHistory(limit, offset);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Export to Excel (.xlsx) (ADMIN ONLY, ASYNC WORKER THREAD) ---
router.get('/export/excel', requireAdmin, exportLimiter, async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const session = req.query.session || null;
    const buffer = await runExportAsync({ type: 'excel', filter, session });

    let sessionSuffix = 'global';
    if (session === 'info' || filter === 'present_info' || filter === 'absent_info') sessionSuffix = 'journee_info';
    else if (session === 'test' || filter === 'present_test' || filter === 'absent_test') sessionSuffix = 'journee_test';
    else if (filter === 'present_both') sessionSuffix = 'deux_seances';

    const filename = `presences_${sessionSuffix}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Export to PDF (ADMIN ONLY, ASYNC WORKER THREAD) ---
router.get('/export/pdf', requireAdmin, exportLimiter, async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const session = req.query.session || null;
    const title = req.query.title || null;
    const buffer = await runExportAsync({ type: 'pdf', filter, title, session });

    let sessionSuffix = 'global';
    if (session === 'info' || filter === 'present_info' || filter === 'absent_info') sessionSuffix = 'journee_info';
    else if (session === 'test' || filter === 'present_test' || filter === 'absent_test') sessionSuffix = 'journee_test';
    else if (filter === 'present_both') sessionSuffix = 'deux_seances';

    const filename = `presences_${sessionSuffix}_${new Date().toISOString().substring(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Network & System Info ---
router.get('/system/network', (req, res) => {
  try {
    const interfaces = getLocalIpAddresses();
    const primaryIp = getPrimaryLanIp();
    const port = process.env.PORT || 3000;

    res.json({
      success: true,
      data: {
        primaryIp,
        port,
        localUrl: `http://localhost:${port}`,
        lanUrl: `http://${primaryIp}:${port}`,
        interfaces,
        activeClients: getActiveClientCount()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Clear All Data (Full reset) (ADMIN ONLY) ---
router.post('/system/clear-all', requireAdmin, (req, res) => {
  try {
    const stats = clearAllData();
    broadcast({
      type: 'DATA_CLEARED',
      data: { stats }
    });
    res.json({ success: true, message: 'Toutes les données ont été effacées.', stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Backup SQLite Database (ADMIN ONLY, ATOMIC VACUUM INTO + INTEGRITY CHECK) ---
router.get('/system/backup', requireAdmin, (req, res) => {
  try {
    const backupInfo = createDatabaseBackup();
    res.download(backupInfo.filepath, backupInfo.filename, (err) => {
      if (err && !res.headersSent) {
        console.error('Erreur lors du téléchargement de la sauvegarde:', err);
        res.status(500).json({ success: false, error: 'Erreur lors du transfert du fichier de sauvegarde.' });
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Restore SQLite Database (ADMIN ONLY, VERIFIED INTEGRITY RESTORATION) ---
router.post('/system/restore', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Veuillez sélectionner un fichier de sauvegarde (.db).' });
    }

    const tempDir = path.resolve(__dirname, '../../data/backups/temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempFilePath = path.join(tempDir, `restore_upload_${Date.now()}.db`);
    fs.writeFileSync(tempFilePath, req.file.buffer);

    const result = restoreDatabaseBackup(tempFilePath);
    try { fs.unlinkSync(tempFilePath); } catch (_) {}

    broadcast({
      type: 'DATA_RESTORED',
      data: { stats: result.stats }
    });

    res.json({
      success: true,
      message: `Sauvegarde restaurée avec succès (${result.restoredPersons} candidats chargés).`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
