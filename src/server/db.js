import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'attendance.db');
const db = new DatabaseSync(dbPath);

// Performance optimizations with WAL mode and synchronous NORMAL
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -64000; -- 64MB cache
`);

// Create base schemas
db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sn TEXT,
    matricule TEXT UNIQUE,
    nom TEXT NOT NULL,
    postnom TEXT,
    prenom TEXT,
    sexe TEXT,
    extra_data TEXT,              -- JSON containing extra columns from Excel
    search_vector TEXT,           -- Normalized text for instant sub-millisecond search
    
    -- Journée 1 : Information
    is_present_info INTEGER DEFAULT 0,
    present_at_info TEXT,
    present_by_info TEXT,

    -- Journée 2 : Test
    is_present_test INTEGER DEFAULT 0,
    present_at_test TEXT,
    present_by_test TEXT,

    -- Legacy presence (kept synchronized for compatibility)
    is_present INTEGER DEFAULT 0,
    present_at TEXT,
    present_by TEXT,

    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_persons_matricule ON persons(matricule);
  CREATE INDEX IF NOT EXISTS idx_persons_sn ON persons(sn);
  CREATE INDEX IF NOT EXISTS idx_persons_nom ON persons(nom);
  CREATE INDEX IF NOT EXISTS idx_persons_search ON persons(search_vector);

  CREATE TABLE IF NOT EXISTS attendance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    matricule TEXT,
    full_name TEXT NOT NULL,
    session_type TEXT DEFAULT 'info',     -- 'info' or 'test'
    session_label TEXT DEFAULT 'Journée d''Information',
    status TEXT NOT NULL,                -- 'present' or 'absent'
    action_time TEXT DEFAULT (datetime('now', 'localtime')),
    agent_name TEXT,
    ip_address TEXT,
    FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_history_time ON attendance_history(action_time DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    imported_at TEXT DEFAULT (datetime('now', 'localtime')),
    total_rows INTEGER,
    new_rows INTEGER,
    updated_rows INTEGER
  );
`);

// Migration helper: Ensure all new columns exist if table was already created
function runMigrations() {
  const tableInfo = db.prepare(`PRAGMA table_info(persons)`).all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  const newCols = [
    { name: 'is_present_info', type: 'INTEGER DEFAULT 0' },
    { name: 'present_at_info', type: 'TEXT' },
    { name: 'present_by_info', type: 'TEXT' },
    { name: 'is_present_test', type: 'INTEGER DEFAULT 0' },
    { name: 'present_at_test', type: 'TEXT' },
    { name: 'present_by_test', type: 'TEXT' },
    { name: 'batch_id', type: 'INTEGER' },
    { name: 'source_file', type: 'TEXT' }
  ];

  for (const col of newCols) {
    if (!existingCols.has(col.name)) {
      try {
        db.exec(`ALTER TABLE persons ADD COLUMN ${col.name} ${col.type};`);
      } catch (_) {}
    }
  }

  // If persons had is_present = 1 previously, sync to is_present_info
  try {
    db.exec(`
      UPDATE persons 
      SET is_present_info = is_present, present_at_info = present_at, present_by_info = present_by
      WHERE is_present = 1 AND is_present_info = 0;
    `);
  } catch (_) {}

  // Check history table
  const histInfo = db.prepare(`PRAGMA table_info(attendance_history)`).all();
  const histCols = new Set(histInfo.map(c => c.name));
  if (!histCols.has('session_type')) {
    try {
      db.exec(`ALTER TABLE attendance_history ADD COLUMN session_type TEXT DEFAULT 'info';`);
      db.exec(`ALTER TABLE attendance_history ADD COLUMN session_label TEXT DEFAULT 'Journée d''Information';`);
    } catch (_) {}
  }

  if (!histCols.has('sn')) {
    try {
      db.exec(`ALTER TABLE attendance_history ADD COLUMN sn TEXT;`);
    } catch (_) {}
  }

  // Create presence indexes AFTER column migrations (safe for existing DBs)
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_persons_presence_info ON persons(is_present_info);`); } catch (_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_persons_presence_test ON persons(is_present_test);`); } catch (_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_persons_batch ON persons(batch_id);`); } catch (_) {}
}
runMigrations();

/**
 * Normalizes text for fast search
 */
export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds the search vector for a person record.
 * CRITICAL: Never converts SN to number; retains all characters and leading zeros.
 */
export function buildSearchVector(p) {
  const snStr = p.sn !== undefined && p.sn !== null ? String(p.sn).trim() : '';
  const parts = [
    snStr,
    p.matricule ? String(p.matricule).trim() : '',
    p.nom ? String(p.nom).trim() : '',
    p.postnom ? String(p.postnom).trim() : '',
    p.prenom ? String(p.prenom).trim() : '',
    p.sexe ? String(p.sexe).trim() : ''
  ];
  if (p.extra_data) {
    try {
      const extra = typeof p.extra_data === 'string' ? JSON.parse(p.extra_data) : p.extra_data;
      if (extra && typeof extra === 'object') {
        parts.push(Object.values(extra).join(' '));
      }
    } catch (_) {}
  }
  return normalizeText(parts.join(' '));
}

/**
 * Returns dashboard statistics for both sessions (Journée d'Information & Journée du Test)
 */
export function getStats() {
  const row = db.prepare(`
    SELECT 
      COUNT(*) AS total,
      
      -- Journée Info
      SUM(CASE WHEN is_present_info = 1 THEN 1 ELSE 0 END) AS present_info,
      SUM(CASE WHEN is_present_info = 0 THEN 1 ELSE 0 END) AS absent_info,
      
      -- Journée Test
      SUM(CASE WHEN is_present_test = 1 THEN 1 ELSE 0 END) AS present_test,
      SUM(CASE WHEN is_present_test = 0 THEN 1 ELSE 0 END) AS absent_test,

      -- Cross stats
      SUM(CASE WHEN is_present_info = 1 AND is_present_test = 1 THEN 1 ELSE 0 END) AS present_both,
      SUM(CASE WHEN is_present_info = 1 AND is_present_test = 0 THEN 1 ELSE 0 END) AS present_only_info,
      SUM(CASE WHEN is_present_info = 0 AND is_present_test = 1 THEN 1 ELSE 0 END) AS present_only_test,
      SUM(CASE WHEN is_present_info = 0 AND is_present_test = 0 THEN 1 ELSE 0 END) AS absent_both,

      -- Gender breakdown
      SUM(CASE WHEN sexe IN ('M', 'HOMME', 'H', 'MASCULIN') THEN 1 ELSE 0 END) AS total_men,
      SUM(CASE WHEN sexe IN ('F', 'FEMME', 'FEMININ') THEN 1 ELSE 0 END) AS total_women,
      SUM(CASE WHEN is_present_info = 1 AND sexe IN ('M', 'HOMME', 'H', 'MASCULIN') THEN 1 ELSE 0 END) AS present_info_men,
      SUM(CASE WHEN is_present_info = 1 AND sexe IN ('F', 'FEMME', 'FEMININ') THEN 1 ELSE 0 END) AS present_info_women,
      SUM(CASE WHEN is_present_test = 1 AND sexe IN ('M', 'HOMME', 'H', 'MASCULIN') THEN 1 ELSE 0 END) AS present_test_men,
      SUM(CASE WHEN is_present_test = 1 AND sexe IN ('F', 'FEMME', 'FEMININ') THEN 1 ELSE 0 END) AS present_test_women
    FROM persons
  `).get();

  const total = Number(row.total || 0);

  const presentInfo = Number(row.present_info || 0);
  const absentInfo = Number(row.absent_info || 0);
  const rateInfo = total > 0 ? Number(((presentInfo / total) * 100).toFixed(1)) : 0;

  const presentTest = Number(row.present_test || 0);
  const absentTest = Number(row.absent_test || 0);
  const rateTest = total > 0 ? Number(((presentTest / total) * 100).toFixed(1)) : 0;

  const lastAction = db.prepare(`
    SELECT action_time, full_name, session_label, status, agent_name 
    FROM attendance_history 
    ORDER BY id DESC LIMIT 1
  `).get();

  return {
    total,
    // Journée Info
    presentInfo,
    absentInfo,
    rateInfo,

    // Journée Test
    presentTest,
    absentTest,
    rateTest,

    // Cross stats
    presentBoth: Number(row.present_both || 0),
    presentOnlyInfo: Number(row.present_only_info || 0),
    presentOnlyTest: Number(row.present_only_test || 0),
    absentBoth: Number(row.absent_both || 0),

    // Gender breakdown
    totalMen: Number(row.total_men || 0),
    totalWomen: Number(row.total_women || 0),
    presentInfoMen: Number(row.present_info_men || 0),
    presentInfoWomen: Number(row.present_info_women || 0),
    presentTestMen: Number(row.present_test_men || 0),
    presentTestWomen: Number(row.present_test_women || 0),

    // Legacy backwards compatibility aliases
    present: presentInfo,
    absent: absentInfo,
    rate: rateInfo,

    lastActivity: lastAction || null
  };
}

/**
 * Ultra-fast search endpoint
 */
export function searchPersons(query, limit = 50) {
  if (!query || !query.trim()) {
    return db.prepare(`
      SELECT * FROM persons ORDER BY is_present_test DESC, is_present_info DESC, nom ASC LIMIT ?
    `).all(limit);
  }

  const raw = query.trim();
  // Clean raw in case user prefixes with "sn:" or "sn "
  const cleanSn = raw.replace(/^(sn|s\/n|n°|no)\s*[:=.]?\s*/i, '').trim();

  const normalized = normalizeText(cleanSn || raw);
  const terms = normalized.split(' ').filter(Boolean);

  if (terms.length === 0) return [];

  const exactMatricule = db.prepare(`
    SELECT * FROM persons WHERE matricule = ? LIMIT 1
  `).get(raw);

  // Exact SN search: checks string directly (never numerical)
  const exactSn = db.prepare(`
    SELECT * FROM persons WHERE sn = ? OR (sn != '' AND sn = ?) LIMIT 1
  `).get(raw, cleanSn);

  const whereClauses = [];
  const params = [];

  for (const term of terms) {
    whereClauses.push('(search_vector LIKE ? OR sn = ? OR sn LIKE ?)');
    params.push(`%${term}%`, term, `${term}%`);
  }

  const sql = `
    SELECT * FROM persons 
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY 
      CASE 
        WHEN matricule = ? THEN 0 
        WHEN sn = ? OR sn = ? THEN 1
        WHEN matricule LIKE ? THEN 2
        WHEN sn LIKE ? OR sn LIKE ? THEN 3
        WHEN nom LIKE ? THEN 4
        ELSE 5 
      END,
      nom ASC
    LIMIT ?
  `;

  params.push(raw);
  params.push(raw);
  params.push(cleanSn);
  params.push(`${raw}%`);
  params.push(`${raw}%`);
  params.push(`${cleanSn}%`);
  params.push(`${terms[0]}%`);
  params.push(limit);

  const results = db.prepare(sql).all(...params);

  let combined = [...results];
  if (exactMatricule) {
    combined = [exactMatricule, ...combined.filter(r => r.id !== exactMatricule.id)];
  }
  if (exactSn && (!exactMatricule || exactSn.id !== exactMatricule.id)) {
    combined = [exactSn, ...combined.filter(r => r.id !== exactSn.id)];
  }

  return combined.slice(0, limit);
}

/**
 * Paginated and filtered list of persons with dual-session filtering
 */
export function getPersonsList({
  page = 1,
  limit = 25,
  statusInfo = 'all',   // 'all', 'present', 'absent'
  statusTest = 'all',   // 'all', 'present', 'absent'
  statusCombo = 'all',  // 'all', 'both', 'only_info', 'only_test', 'neither'
  sexe = 'all',         // 'all', 'M', 'F'
  search = '',
  sortBy = 'id',
  sortOrder = 'ASC'
}) {
  const conditions = [];
  const params = [];

  // Info status filter
  if (statusInfo === 'present') {
    conditions.push('is_present_info = 1');
  } else if (statusInfo === 'absent') {
    conditions.push('is_present_info = 0');
  }

  // Test status filter
  if (statusTest === 'present') {
    conditions.push('is_present_test = 1');
  } else if (statusTest === 'absent') {
    conditions.push('is_present_test = 0');
  }

  // Combo filter
  if (statusCombo === 'both') {
    conditions.push('is_present_info = 1 AND is_present_test = 1');
  } else if (statusCombo === 'only_info') {
    conditions.push('is_present_info = 1 AND is_present_test = 0');
  } else if (statusCombo === 'only_test') {
    conditions.push('is_present_info = 0 AND is_present_test = 1');
  } else if (statusCombo === 'neither') {
    conditions.push('is_present_info = 0 AND is_present_test = 0');
  }

  // Gender filter
  if (sexe === 'M') {
    conditions.push("sexe IN ('M', 'HOMME', 'H', 'MASCULIN')");
  } else if (sexe === 'F') {
    conditions.push("sexe IN ('F', 'FEMME', 'FEMININ')");
  }

  // Search filter
  if (search && search.trim()) {
    const rawSearch = search.trim();
    const cleanSearchSn = rawSearch.replace(/^(sn|s\/n|n°|no)\s*[:=.]?\s*/i, '').trim();
    const terms = normalizeText(cleanSearchSn || rawSearch).split(' ').filter(Boolean);
    for (const term of terms) {
      conditions.push('(search_vector LIKE ? OR sn = ? OR sn = ? OR sn LIKE ? OR matricule = ?)');
      params.push(`%${term}%`, rawSearch, cleanSearchSn, `${term}%`, rawSearch);
    }
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM persons ${whereSql}`;
  const totalCount = Number(db.prepare(countSql).get(...params).total || 0);

  const allowedSortCols = [
    'id', 'sn', 'matricule', 'nom', 'postnom', 'prenom', 'sexe', 
    'is_present_info', 'present_at_info', 
    'is_present_test', 'present_at_test'
  ];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'id';
  const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const offset = Math.max(0, (page - 1) * limit);
  const dataSql = `
    SELECT * FROM persons 
    ${whereSql}
    ORDER BY ${safeSortCol} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(dataSql).all(...params, limit, offset);

  return {
    data: rows,
    total: totalCount,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(totalCount / limit) || 1
  };
}

/**
 * Toggle presence status for a specific session ('info' or 'test')
 */
export function togglePresence(id, sessionType = 'info', forcedStatus = null, agentName = 'Agent', ipAddress = '') {
  const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(id);
  if (!person) throw new Error(`Personne avec ID ${id} introuvable.`);

  const isTest = sessionType === 'test';
  const colStatus = isTest ? 'is_present_test' : 'is_present_info';
  const colTime = isTest ? 'present_at_test' : 'present_at_info';
  const colBy = isTest ? 'present_by_test' : 'present_by_info';
  const sessionLabel = isTest ? 'Journée du Test' : 'Journée d\'Information';

  const currentVal = person[colStatus] === 1 ? 1 : 0;
  let newVal;
  if (forcedStatus !== null) {
    newVal = forcedStatus ? 1 : 0;
  } else {
    newVal = currentVal === 1 ? 0 : 1;
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const presentAt = newVal === 1 ? now : null;
  const presentBy = newVal === 1 ? (agentName || 'Agent') : null;

  // Also update overall is_present (present if present in either session)
  const otherVal = isTest ? person.is_present_info : person.is_present_test;
  const overallPresent = (newVal === 1 || otherVal === 1) ? 1 : 0;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(`
      UPDATE persons 
      SET ${colStatus} = ?, ${colTime} = ?, ${colBy} = ?, is_present = ?, updated_at = ?
      WHERE id = ?
    `).run(newVal, presentAt, presentBy, overallPresent, now, id);

    // Record audit history
    const fullName = [person.nom, person.postnom, person.prenom].filter(Boolean).join(' ');
    const personSn = person.sn !== undefined && person.sn !== null ? String(person.sn).trim() : '';
    db.prepare(`
      INSERT INTO attendance_history (person_id, sn, matricule, full_name, session_type, session_label, status, action_time, agent_name, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      personSn,
      person.matricule || '',
      fullName,
      sessionType,
      sessionLabel,
      newVal === 1 ? 'present' : 'absent',
      now,
      agentName || 'Poste',
      ipAddress || ''
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updatedPerson = db.prepare('SELECT * FROM persons WHERE id = ?').get(id);
  return {
    person: updatedPerson,
    sessionType,
    stats: getStats()
  };
}

/**
 * Bulk mark presence for a specific session
 */
export function bulkMarkPresence(ids, sessionType = 'info', isPresent = true, agentName = 'Agent', ipAddress = '') {
  if (!Array.isArray(ids) || ids.length === 0) return { updated: 0, stats: getStats() };

  const isTest = sessionType === 'test';
  const colStatus = isTest ? 'is_present_test' : 'is_present_info';
  const colTime = isTest ? 'present_at_test' : 'present_at_info';
  const colBy = isTest ? 'present_by_test' : 'present_by_info';
  const sessionLabel = isTest ? 'Journée du Test' : 'Journée d\'Information';

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const statusInt = isPresent ? 1 : 0;
  const presentAt = isPresent ? now : null;
  const presentBy = isPresent ? (agentName || 'Agent') : null;

  db.exec('BEGIN TRANSACTION');
  try {
    const updateStmt = db.prepare(`
      UPDATE persons 
      SET ${colStatus} = ?, ${colTime} = ?, ${colBy} = ?, updated_at = ?
      WHERE id = ?
    `);
    const historyStmt = db.prepare(`
      INSERT INTO attendance_history (person_id, sn, matricule, full_name, session_type, session_label, status, action_time, agent_name, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const fetchStmt = db.prepare('SELECT id, sn, matricule, nom, postnom, prenom FROM persons WHERE id = ?');

    let count = 0;
    for (const id of ids) {
      const p = fetchStmt.get(id);
      if (p) {
        updateStmt.run(statusInt, presentAt, presentBy, now, id);
        const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
        const pSn = p.sn !== undefined && p.sn !== null ? String(p.sn).trim() : '';
        historyStmt.run(id, pSn, p.matricule || '', fullName, sessionType, sessionLabel, isPresent ? 'present' : 'absent', now, agentName, ipAddress);
        count++;
      }
    }
    db.exec('COMMIT');
    return { updated: count, sessionType, stats: getStats() };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Reset attendances: can reset 'all', 'info', or 'test'
 */
export function resetAllAttendance(sessionType = 'all', agentName = 'Admin') {
  db.exec('BEGIN TRANSACTION');
  try {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (sessionType === 'info') {
      db.prepare(`
        UPDATE persons 
        SET is_present_info = 0, present_at_info = NULL, present_by_info = NULL, updated_at = ?
      `).run(now);
      db.prepare(`
        INSERT INTO attendance_history (person_id, matricule, full_name, session_type, session_label, status, action_time, agent_name)
        VALUES (0, 'ALL', 'RÉINITIALISATION JOURNÉE D''INFORMATION', 'info', 'Journée d''Information', 'reset', ?, ?)
      `).run(now, agentName);
    } else if (sessionType === 'test') {
      db.prepare(`
        UPDATE persons 
        SET is_present_test = 0, present_at_test = NULL, present_by_test = NULL, updated_at = ?
      `).run(now);
      db.prepare(`
        INSERT INTO attendance_history (person_id, matricule, full_name, session_type, session_label, status, action_time, agent_name)
        VALUES (0, 'ALL', 'RÉINITIALISATION JOURNÉE DU TEST', 'test', 'Journée du Test', 'reset', ?, ?)
      `).run(now, agentName);
    } else {
      // Both
      db.prepare(`
        UPDATE persons 
        SET is_present_info = 0, present_at_info = NULL, present_by_info = NULL,
            is_present_test = 0, present_at_test = NULL, present_by_test = NULL,
            is_present = 0, present_at = NULL, present_by = NULL,
            updated_at = ?
      `).run(now);
      db.prepare(`
        INSERT INTO attendance_history (person_id, matricule, full_name, session_type, session_label, status, action_time, agent_name)
        VALUES (0, 'ALL', 'RÉINITIALISATION GÉNÉRALE (INFO & TEST)', 'all', 'Toutes les séances', 'reset', ?, ?)
      `).run(now, agentName);
    }

    db.exec('COMMIT');
    return getStats();
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Clears all persons and history
 */
export function clearAllData() {
  db.exec(`
    DELETE FROM attendance_history;
    DELETE FROM persons;
    DELETE FROM import_batches;
    DELETE FROM sqlite_sequence WHERE name IN ('persons', 'attendance_history', 'import_batches');
  `);
  return getStats();
}

/**
 * Get audit history with explicit SN support
 */
export function getHistory(limit = 100, offset = 0) {
  const rows = db.prepare(`
    SELECT h.*, COALESCE(NULLIF(h.sn, ''), p.sn, '') as sn 
    FROM attendance_history h
    LEFT JOIN persons p ON p.id = h.person_id
    ORDER BY h.id DESC 
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = Number(db.prepare('SELECT COUNT(*) as c FROM attendance_history').get().c || 0);

  return { rows, total };
}

/**
 * Batch insert or update persons from Excel import
 * CRITICAL: Stores SN as verbatim TEXT without stripping leading zeros.
 */
export function insertPersonsBatch(personsList, updateDuplicates = false, filename = 'Fichier Excel') {
  if (!Array.isArray(personsList) || personsList.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0, errors: [] };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  db.exec('BEGIN TRANSACTION');
  try {
    // Record in import_batches
    db.prepare(`
      INSERT INTO import_batches (filename, total_rows, new_rows, updated_rows)
      VALUES (?, ?, 0, 0)
    `).run(filename || 'Fichier Excel', personsList.length);

    const batchRow = db.prepare('SELECT last_insert_rowid() as id').get();
    const batchId = Number(batchRow.id);

    const findStmt = db.prepare('SELECT id FROM persons WHERE matricule = ?');
    const insertStmt = db.prepare(`
      INSERT INTO persons (sn, matricule, nom, postnom, prenom, sexe, extra_data, search_vector, batch_id, source_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE persons 
      SET sn = ?, nom = ?, postnom = ?, prenom = ?, sexe = ?, extra_data = ?, search_vector = ?, 
          batch_id = ?, source_file = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `);

    for (let i = 0; i < personsList.length; i++) {
      const p = personsList[i];
      const nom = String(p.nom || '').trim();
      if (!nom) {
        skipped++;
        continue;
      }

      // CRITICAL: Ensure SN is strictly a string and retains leading zeros (e.g. "0002")
      const sn = p.sn !== undefined && p.sn !== null ? String(p.sn).trim() : '';
      const matricule = p.matricule ? String(p.matricule).trim() : null;
      const postnom = p.postnom ? String(p.postnom).trim() : '';
      const prenom = p.prenom ? String(p.prenom).trim() : '';
      const sexe = p.sexe ? String(p.sexe).trim() : '';
      const searchVec = buildSearchVector({ ...p, sn, matricule, nom, postnom, prenom, sexe });
      const extraJson = p.extra_data ? (typeof p.extra_data === 'string' ? p.extra_data : JSON.stringify(p.extra_data)) : null;

      if (matricule) {
        const existing = findStmt.get(matricule);
        if (existing) {
          if (updateDuplicates) {
            updateStmt.run(sn, nom, postnom, prenom, sexe, extraJson, searchVec, batchId, filename, existing.id);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
      }

      insertStmt.run(sn, matricule, nom, postnom, prenom, sexe, extraJson, searchVec, batchId, filename);
      inserted++;
    }

    // Update batch record counts
    db.prepare(`
      UPDATE import_batches 
      SET new_rows = ?, updated_rows = ?
      WHERE id = ?
    `).run(inserted, updated, batchId);

    db.exec('COMMIT');
    return { batchId, inserted, updated, skipped, errors, stats: getStats() };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Returns list of imported files/batches
 */
export function getImportedBatches() {
  return db.prepare(`
    SELECT 
      b.id,
      b.filename,
      b.imported_at,
      b.total_rows,
      b.new_rows,
      b.updated_rows,
      COUNT(p.id) as current_persons_count
    FROM import_batches b
    LEFT JOIN persons p ON p.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.id DESC
  `).all();
}

/**
 * Deletes an imported batch and its persons
 */
export function deleteImportedBatch(batchId) {
  db.exec('BEGIN TRANSACTION');
  try {
    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
    if (!batch) {
      db.exec('COMMIT');
      return { success: false, deletedCount: 0, stats: getStats() };
    }

    const countRow = db.prepare('SELECT COUNT(*) as c FROM persons WHERE batch_id = ?').get(batchId);
    const count = Number(countRow.c || 0);

    // Delete persons associated with this batch
    db.prepare('DELETE FROM persons WHERE batch_id = ?').run(batchId);

    // Delete batch record
    db.prepare('DELETE FROM import_batches WHERE id = ?').run(batchId);

    db.exec('COMMIT');
    return {
      success: true,
      deletedCount: count,
      filename: batch.filename,
      stats: getStats()
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Get all persons formatted for export
 */
export function getAllForExport(filter = 'all') {
  let where = '';
  if (filter === 'present_info') where = 'WHERE is_present_info = 1';
  else if (filter === 'absent_info') where = 'WHERE is_present_info = 0';
  else if (filter === 'present_test') where = 'WHERE is_present_test = 1';
  else if (filter === 'absent_test') where = 'WHERE is_present_test = 0';
  else if (filter === 'present_both') where = 'WHERE is_present_info = 1 AND is_present_test = 1';
  else if (filter === 'present_either') where = 'WHERE is_present_info = 1 OR is_present_test = 1';

  return db.prepare(`
    SELECT * FROM persons ${where} ORDER BY nom ASC, postnom ASC, prenom ASC
  `).all();
}

/**
 * Settings helpers
 */
export function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

/**
 * Gets active session day setting ('info' or 'test')
 */
export function getActiveDay() {
  const day = getSetting('active_day', 'info');
  return day === 'test' ? 'test' : 'info';
}

/**
 * Sets active session day setting
 */
export function setActiveDay(day) {
  const safe = day === 'test' ? 'test' : 'info';
  setSetting('active_day', safe);
  return safe;
}

/**
 * Get person with latest attendance details for a given session
 */
export function getPersonPresenceDetails(personId, sessionType = 'info') {
  const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(personId);
  if (!person) return null;

  const isTest = sessionType === 'test';
  const isPresent = isTest ? person.is_present_test === 1 : person.is_present_info === 1;

  let historyRecord = null;
  if (isPresent) {
    historyRecord = db.prepare(`
      SELECT action_time, agent_name, ip_address, session_label
      FROM attendance_history
      WHERE person_id = ? AND session_type = ? AND status = 'present'
      ORDER BY id DESC LIMIT 1
    `).get(personId, sessionType);
  }

  return {
    person,
    sessionType,
    isPresent,
    presentAt: isTest ? person.present_at_test : person.present_at_info,
    presentBy: isTest ? person.present_by_test : person.present_by_info,
    historyRecord
  };
}

/**
 * Creates an atomic, consistent SQLite backup using VACUUM INTO after WAL checkpoint.
 * Automatically verifies integrity with PRAGMA integrity_check.
 */
export function createDatabaseBackup(destinationPath = null) {
  const backupsDir = path.resolve(dataDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `backup_attendance_${timestamp}.db`;
  const targetPath = destinationPath || path.join(backupsDir, filename);

  // 1. Force WAL checkpoint to flush active memory pages
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (_) {}

  // 2. Perform atomic VACUUM INTO backup
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  const safeSqlPath = targetPath.replace(/\\/g, '/');
  db.exec(`VACUUM INTO '${safeSqlPath}';`);

  // 3. Verify backup file integrity
  const backupDb = new DatabaseSync(targetPath);
  const integrity = backupDb.prepare('PRAGMA integrity_check').get();
  const countRow = backupDb.prepare('SELECT COUNT(*) as c FROM persons').get();
  const historyRow = backupDb.prepare('SELECT COUNT(*) as c FROM attendance_history').get();
  backupDb.close();

  if (!integrity || integrity.integrity_check !== 'ok') {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    throw new Error(`Échec de l'intégrité de la sauvegarde SQLite: ${integrity?.integrity_check || 'Erreur inconnue'}`);
  }

  const fileStats = fs.statSync(targetPath);

  return {
    success: true,
    filepath: targetPath,
    filename: path.basename(targetPath),
    sizeBytes: fileStats.size,
    personCount: Number(countRow?.c || 0),
    historyCount: Number(historyRow?.c || 0),
    integrity: 'ok',
    createdAt: new Date().toISOString()
  };
}

/**
 * Restores a SQLite database backup safely.
 * 1. Validates integrity of source file
 * 2. Creates emergency backup of current DB before replacing
 * 3. Restores tables cleanly within transaction
 */
export function restoreDatabaseBackup(sourceBackupPath) {
  if (!fs.existsSync(sourceBackupPath)) {
    throw new Error('Fichier de sauvegarde introuvable.');
  }

  // Verify candidate backup file integrity first
  const candidateDb = new DatabaseSync(sourceBackupPath);
  const candidateCheck = candidateDb.prepare('PRAGMA integrity_check').get();
  if (!candidateCheck || candidateCheck.integrity_check !== 'ok') {
    candidateDb.close();
    throw new Error('Le fichier de sauvegarde est corrompu ou invalide.');
  }
  const restoredPersons = candidateDb.prepare('SELECT COUNT(*) as c FROM persons').get().c;
  candidateDb.close();

  // 1. Create an emergency safety backup of current data
  const emergencyDir = path.resolve(dataDir, 'backups/emergency_pre_restore');
  if (!fs.existsSync(emergencyDir)) fs.mkdirSync(emergencyDir, { recursive: true });
  const emergencyPath = path.join(emergencyDir, `safety_before_restore_${Date.now()}.db`);
  createDatabaseBackup(emergencyPath);

  // 2. Clear current DB tables and copy from candidate
  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      DELETE FROM attendance_history;
      DELETE FROM persons;
      DELETE FROM import_batches;
      DELETE FROM settings;
    `);

    // Attach candidate DB to copy data cleanly
    const safeAttachPath = sourceBackupPath.replace(/\\/g, '/');
    db.exec(`ATTACH DATABASE '${safeAttachPath}' AS candidate;`);
    db.exec(`
      INSERT INTO persons SELECT * FROM candidate.persons;
      INSERT INTO attendance_history SELECT * FROM candidate.attendance_history;
      INSERT INTO import_batches SELECT * FROM candidate.import_batches;
      INSERT OR REPLACE INTO settings SELECT * FROM candidate.settings;
    `);
    db.exec('DETACH DATABASE candidate;');

    db.exec('COMMIT');

    // Force checkpoint
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}

    return {
      success: true,
      restoredPersons: Number(restoredPersons),
      emergencyBackupPath: emergencyPath,
      stats: getStats()
    };
  } catch (err) {
    db.exec('ROLLBACK');
    try { db.exec('DETACH DATABASE candidate;'); } catch (_) {}
    throw err;
  }
}

export default {
  db,
  getStats,
  searchPersons,
  getPersonsList,
  togglePresence,
  bulkMarkPresence,
  resetAllAttendance,
  clearAllData,
  getHistory,
  insertPersonsBatch,
  getImportedBatches,
  deleteImportedBatch,
  getAllForExport,
  getSetting,
  setSetting,
  getActiveDay,
  setActiveDay,
  getPersonPresenceDetails,
  createDatabaseBackup,
  restoreDatabaseBackup,
  normalizeText,
  buildSearchVector
};

