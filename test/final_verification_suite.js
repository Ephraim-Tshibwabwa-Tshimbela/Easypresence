import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function httpRequest(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runTests() {
  console.log('======================================================================');
  console.log('    SUITE DE VERIFICATION FINALE & TESTS DE CHARGE EASYPRESENCE      ');
  console.log('======================================================================\n');

  let adminToken = '';
  let testsPassed = 0;
  let testsTotal = 0;

  function assert(condition, testName) {
    testsTotal++;
    if (condition) {
      console.log(`  [OK] ${testName}`);
      testsPassed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
    }
  }

  // --- PARTIE 1: TESTS DE SECURITE & AUTHENTIFICATION ---
  console.log('--- 1. TESTS DE SECURITE, AUTHENTIFICATION & EN-TETES ---');

  // Test 1.1: Security headers
  const rootRes = await httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/',
    method: 'GET'
  });
  assert(
    rootRes.headers['x-content-type-options'] === 'nosniff' &&
    rootRes.headers['x-frame-options'] === 'SAMEORIGIN' &&
    rootRes.headers['content-security-policy']?.includes("default-src 'self'"),
    'En-têtes HTTP de sécurité stricts (CSP, nosniff, SAMEORIGIN)'
  );

  // Test 1.2: Bad password rejected
  const badLoginRes = await httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { password: 'wrong_password_123' });
  assert(badLoginRes.statusCode === 401, 'Tentative de connexion avec mauvais mot de passe rejetée (401)');

  // Test 1.3: Good password accepted
  const goodLoginRes = await httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { password: 'admin2026' });
  assert(goodLoginRes.statusCode === 200, 'Connexion administrateur avec mot de passe valide acceptée (200)');
  try {
    const json = JSON.parse(goodLoginRes.body);
    adminToken = json.token;
    assert(adminToken && adminToken.length === 64, 'Token cryptographique émis avec succès (64 hex chars)');
  } catch (_) {
    assert(false, 'Token d\'authentification manquant dans la réponse JSON');
  }

  // Test 1.4: Spoofed IP blocked without token on admin route
  // Simulating an external request by sending invalid authorization
  const unauthBackup = await httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/system/backup',
    method: 'GET',
    headers: {
      'X-Forwarded-For': '127.0.0.1', // Attempted IP spoofing
      'Authorization': 'Bearer invalid_token_xyz'
    }
  });
  assert(unauthBackup.statusCode === 401, 'Tentative de spoofing IP rejetée sans token valide (401)');

  // Test 1.5: Authorized admin access with Bearer token
  const authBackup = await httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/system/backup',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  assert(authBackup.statusCode === 200, 'Accès administrateur autorisé avec Bearer Token (200 OK)');

  // --- PARTIE 2: TESTS INTEGRITE SQLITE & SAUVEGARDE WAL ---
  console.log('\n--- 2. TESTS DE LA BASE DE DONNEES & INTEGRITE WAL ---');

  const dbPath = path.resolve(__dirname, '../data/attendance.db');
  const db = new DatabaseSync(dbPath);

  // Test 2.1: Foreign keys enabled
  const fkCheck = db.prepare('PRAGMA foreign_keys;').get();
  assert(fkCheck && Object.values(fkCheck)[0] === 1, 'PRAGMA foreign_keys = 1 (Intégrité référentielle active)');

  // Test 2.2: PRAGMA integrity_check
  const integrity = db.prepare('PRAGMA integrity_check;').get();
  assert(integrity && integrity.integrity_check === 'ok', 'PRAGMA integrity_check = ok (Base SQLite sans corruption)');

  // Test 2.3: Verification of backup file from previous call
  const backupsDir = path.resolve(__dirname, '../data/backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const backupFiles = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db'));
  assert(backupFiles.length > 0, `Fichiers de sauvegarde atomiques générés (${backupFiles.length} fichiers trouvés)`);
  if (backupFiles.length > 0) {
    const latestBak = path.resolve(backupsDir, backupFiles.sort().reverse()[0]);
    const bakDb = new DatabaseSync(latestBak);
    const bakCheck = bakDb.prepare('PRAGMA integrity_check;').get();
    assert(bakCheck && bakCheck.integrity_check === 'ok', 'Intégrité de la sauvegarde VACUUM INTO validée (ok)');
    bakDb.close();
  }
  db.close();

  // --- PARTIE 3: TEST WORKER THREAD & ABSENCE DE GEL EVENT LOOP ---
  console.log('\n--- 3. TEST DE NON-BLOCAGE DE L\'EVENT LOOP (WORKER THREAD EXPORT) ---');

  console.log('  Lancement d\'un export PDF volumineux (2000+ lignes)...');
  const exportPromise = httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/export/pdf?filter=all&session=all',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  // Pendant que l'export tourne dans le worker, exécuter 20 requêtes de recherche
  const searchLatenciesDuringExport = [];
  const startSearchBatch = Date.now();
  for (let i = 0; i < 20; i++) {
    const t0 = Date.now();
    const sRes = await httpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/search?q=KAB',
      method: 'GET'
    });
    const dt = Date.now() - t0;
    searchLatenciesDuringExport.push(dt);
    // Petit délai de 50ms
    await new Promise(r => setTimeout(r, 50));
  }

  const exportRes = await exportPromise;
  const p95DuringExport = percentile(searchLatenciesDuringExport, 95);
  console.log(`  Export PDF terminé : ${exportRes.statusCode} (${exportRes.body.length} octets reçus)`);
  console.log(`  Latence P95 des recherches pendant l'export : ${p95DuringExport.toFixed(1)} ms`);
  assert(
    exportRes.statusCode === 200 && p95DuringExport < 150,
    `Event loop préservée : P95 search pendant export = ${p95DuringExport.toFixed(1)} ms (< 150 ms attendu)`
  );

  // --- PARTIE 4: TESTS DE CHARGE PROGRESSIFS (10, 25, 50, 75, 100 VU) ---
  console.log('\n--- 4. BENCHMARK DE CHARGE ET CONCURRENCE MULTI-UTILISATEURS ---');
  console.log('Simulation d\'agents de pointage et de recherche en concurrence directe:\n');

  const candidateIdsRes = await httpRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/api/persons?limit=10',
    method: 'GET'
  });
  const sampleCandidates = JSON.parse(candidateIdsRes.body).data || [];
  const testCandidateId = sampleCandidates[0]?.id || 1;

  const scenarios = [10, 25, 50, 75, 100];
  const benchmarkResults = [];

  for (const vuCount of scenarios) {
    const reqsPerVu = 15;
    const totalRequests = vuCount * reqsPerVu;
    const latencies = [];
    let errorCount = 0;

    const queries = ['KAB', 'MUK', 'ILU', 'BAN', 'KAS', 'TSH', 'LUM', 'NGO', '001', '104'];

    const tStart = Date.now();

    const workers = Array.from({ length: vuCount }, async (_, vuIndex) => {
      for (let r = 0; r < reqsPerVu; r++) {
        const opType = r % 5;
        const t0 = Date.now();
        let res;

        try {
          if (opType === 0) {
            // Stats fetch
            res = await httpRequest({
              hostname: '127.0.0.1',
              port: PORT,
              path: '/api/stats',
              method: 'GET'
            });
          } else if (opType === 1) {
            // Scanner direct exact match
            res = await httpRequest({
              hostname: '127.0.0.1',
              port: PORT,
              path: `/api/search?q=CAND-${String(100 + (r % 20)).padStart(4, '0')}`,
              method: 'GET'
            });
          } else if (opType === 2 && vuIndex % 5 === 0) {
            // Toggle presence (write transaction)
            res = await httpRequest({
              hostname: '127.0.0.1',
              port: PORT,
              path: '/api/presence/toggle',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            }, {
              id: testCandidateId,
              session: 'info',
              agentName: `Poste_${vuIndex + 1}`
            });
          } else {
            // Search typing
            const q = queries[(vuIndex + r) % queries.length];
            res = await httpRequest({
              hostname: '127.0.0.1',
              port: PORT,
              path: `/api/search?q=${encodeURIComponent(q)}`,
              method: 'GET'
            });
          }

          const dt = Date.now() - t0;
          latencies.push(dt);
          if (res.statusCode >= 400 && res.statusCode !== 429) {
            errorCount++;
          }
        } catch (err) {
          errorCount++;
        }
      }
    });

    await Promise.all(workers);
    const durationSec = (Date.now() - tStart) / 1000;
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);
    const rps = totalRequests / durationSec;

    benchmarkResults.push({
      vuCount,
      totalRequests,
      durationSec,
      rps,
      avg,
      p50,
      p95,
      p99,
      errorCount,
      errorRate: ((errorCount / totalRequests) * 100).toFixed(2)
    });

    console.log(`  [VU = ${String(vuCount).padStart(3)}] ` +
      `Reqs: ${totalRequests} | ` +
      `Durée: ${durationSec.toFixed(2)}s | ` +
      `Débit: ${rps.toFixed(1)} req/s | ` +
      `Moy: ${avg.toFixed(1)}ms | ` +
      `P50: ${p50}ms | ` +
      `P95: ${p95}ms | ` +
      `P99: ${p99}ms | ` +
      `Erreurs: ${errorCount} (${((errorCount / totalRequests) * 100).toFixed(1)}%)`
    );
  }

  console.log('\n======================================================================');
  console.log(`RESULTATS : ${testsPassed}/${testsTotal} assertions validées.`);
  console.log('======================================================================\n');

  return { testsPassed, testsTotal, benchmarkResults };
}

runTests().catch(err => {
  console.error('Erreur globale du test :', err);
  process.exit(1);
});
