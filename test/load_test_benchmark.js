import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Percentile calculator helper
function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;

  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2))
  };
}

// Search terms pool reflecting typical agent operations
const SEARCH_QUERIES = [
  'Jean', 'BANZE', 'MUBIAYI', 'KASEREKA', '0002', '0785', '0183', '1055',
  'deborah', 'kadiebue', 'franck', 'joelle', 'lumumba', 'pat', 'est', 'pierre'
];

/**
 * Runs a simulated load test with N concurrent virtual users
 */
async function runLoadScenario({ virtualUsers, durationSeconds, includeWebSockets = true }) {
  console.log(`\n======================================================`);
  console.log(`🚀 SCÉNARIO : ${virtualUsers} UTILISATEURS SIMULTANÉS (${durationSeconds}s)`);
  console.log(`======================================================`);

  const initialMemory = process.memoryUsage();
  const latencies = [];
  let successCount = 0;
  let errorCount = 0;
  let running = true;

  // Open WebSocket connections for each virtual user if enabled
  const wsClients = [];
  let wsMessagesReceived = 0;

  if (includeWebSockets) {
    for (let i = 0; i < virtualUsers; i++) {
      try {
        const ws = new WebSocket(WS_URL);
        ws.on('message', () => { wsMessagesReceived++; });
        ws.on('error', () => {});
        wsClients.push(ws);
      } catch (_) {}
    }
    // Allow WS handshakes to settle
    await sleep(400);
  }

  const startTime = performance.now();

  // Create virtual user worker tasks
  const workers = Array.from({ length: virtualUsers }, async (_, userId) => {
    while (running) {
      const q = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
      const endpoint = Math.random() < 0.7 
        ? `/api/search?q=${encodeURIComponent(q)}` 
        : (Math.random() < 0.5 ? '/api/stats' : '/api/persons?page=1&limit=25');

      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE_URL}${endpoint}`);
        const data = await res.json();
        const t1 = performance.now();
        if (res.ok && data.success) {
          latencies.push(t1 - t0);
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }

      // Small think time between user keystrokes / clicks (20-60ms)
      await sleep(20 + Math.random() * 40);
    }
  });

  // Run for duration
  await sleep(durationSeconds * 1000);
  running = false;
  await Promise.all(workers);

  const totalTimeSec = (performance.now() - startTime) / 1000;
  const stats = calculatePercentiles(latencies);
  const rps = (successCount / totalTimeSec).toFixed(1);
  const errRate = ((errorCount / (successCount + errorCount || 1)) * 100).toFixed(2);
  const finalMemory = process.memoryUsage();
  const heapDiffMb = ((finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024)).toFixed(2);

  // Close WS clients
  for (const ws of wsClients) {
    try { ws.close(); } catch (_) {}
  }

  console.log(` - Requêtes réussies   : ${successCount}`);
  console.log(` - Échecs / Erreurs    : ${errorCount} (${errRate} %)`);
  console.log(` - Débit (RPS)         : ${rps} req/sec`);
  console.log(` - Temps moyen         : ${stats.mean} ms`);
  console.log(` - Médiane (P50)       : ${stats.p50} ms`);
  console.log(` - Percentile 95 (P95) : ${stats.p95} ms`);
  console.log(` - Percentile 99 (P99) : ${stats.p99} ms`);
  console.log(` - Min / Max           : ${stats.min} ms / ${stats.max} ms`);
  console.log(` - WebSockets connectés: ${wsClients.length} (messages reçus: ${wsMessagesReceived})`);
  console.log(` - Variation Heap RAM  : ${heapDiffMb} MB`);

  return {
    virtualUsers,
    totalRequests: successCount + errorCount,
    successCount,
    errorCount,
    errRate,
    rps: Number(rps),
    stats,
    wsCount: wsClients.length,
    wsMessagesReceived,
    heapDiffMb
  };
}

/**
 * Race condition test: 50 concurrent agents trying to mark the EXACT SAME candidate at the same millisecond
 */
async function testConcurrencyRace() {
  console.log(`\n======================================================`);
  console.log(`⚔️ TEST DE CONCURRENCE & DOUBLE-POINTAGE (RACE CONDITION)`);
  console.log(`======================================================`);

  // 1. Fetch a candidate who is currently absent
  const searchRes = await fetch(`${BASE_URL}/api/search?q=BANZE`);
  const candidates = (await searchRes.json()).data;
  if (!candidates || candidates.length === 0) {
    console.log('Aucun candidat trouvé pour le test de concurrence.');
    return;
  }

  const target = candidates[0];
  console.log(`Candidat cible : ID ${target.id} — ${target.nom} (SN: ${target.sn})`);

  // First ensure candidate is marked absent (reset presence for info)
  await fetch(`${BASE_URL}/api/presence/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: target.id, sessionType: 'info', status: 0 })
  });

  console.log(`Lancement de 50 requêtes simultanées de pointage pour ce même candidat...`);
  const t0 = performance.now();

  const promises = Array.from({ length: 50 }, (_, i) => {
    return fetch(`${BASE_URL}/api/presence/confirm-mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: target.id,
        agentName: `Agent-Poste-${String(i + 1).padStart(2, '0')}`
      })
    }).then(r => r.json());
  });

  const results = await Promise.all(promises);
  const duration = (performance.now() - t0).toFixed(2);

  const markedSuccess = results.filter(r => r.success && !r.alreadyPresent);
  const alreadyPresentBlocked = results.filter(r => r.alreadyPresent);
  const errors = results.filter(r => !r.success && !r.alreadyPresent);

  console.log(` - Temps d'exécution total      : ${duration} ms`);
  console.log(` - Succès (présence marquée)     : ${markedSuccess.length}`);
  console.log(` - Bloqués (déjà présent)        : ${alreadyPresentBlocked.length}`);
  console.log(` - Erreurs applicatives          : ${errors.length}`);

  // Check audit history duplicates
  const histRes = await fetch(`${BASE_URL}/api/history?limit=100`);
  const history = (await histRes.json()).data.rows;
  const targetHistory = history.filter(h => h.person_id === target.id && h.status === 'present');

  console.log(` - Entrées dans l'historique audit : ${targetHistory.length} entrée(s)`);
  if (markedSuccess.length > 1 || targetHistory.length > 1) {
    console.log(` ⚠️ ANOMALIE DÉTECTÉE : Concurrence non maîtrisée ! Double pointage possible (${markedSuccess.length} succès au lieu de 1).`);
  } else {
    console.log(` ✅ Concurrence correcte : Exactement 1 pointage enregistré, les 49 autres rejetés comme "déjà présent".`);
  }

  return {
    markedSuccess: markedSuccess.length,
    alreadyPresentBlocked: alreadyPresentBlocked.length,
    historyEntries: targetHistory.length
  };
}

/**
 * Heavy Operation Impact Test:
 * What happens when 1 user exports a heavy PDF while 50 users are searching?
 */
async function testHeavyExportInterference() {
  console.log(`\n======================================================`);
  console.log(`💥 TEST D'INTERFÉRENCE : EXPORT PDF LOURD PENDANT CHARGE 50 USERS`);
  console.log(`======================================================`);

  let running = true;
  const searchLatenciesDuringExport = [];

  // Start 25 concurrent search queries continuously
  const workers = Array.from({ length: 25 }, async () => {
    while (running) {
      const t0 = performance.now();
      try {
        await fetch(`${BASE_URL}/api/search?q=Jean`);
        searchLatenciesDuringExport.push(performance.now() - t0);
      } catch (_) {}
      await sleep(10);
    }
  });

  await sleep(500); // warm up
  console.log(`Déclenchement d'un export PDF complet (2 000+ candidats)...`);
  const tPdf0 = performance.now();
  const pdfRes = await fetch(`${BASE_URL}/api/export/pdf?filter=all`);
  const pdfBuf = await pdfRes.arrayBuffer();
  const pdfDuration = (performance.now() - tPdf0).toFixed(2);
  console.log(`PDF généré : ${(pdfBuf.byteLength / 1024).toFixed(1)} KB en ${pdfDuration} ms`);

  running = false;
  await Promise.all(workers);

  const stats = calculatePercentiles(searchLatenciesDuringExport);
  console.log(`Latences de recherche pendant la génération du PDF :`);
  console.log(` - Moyenne : ${stats.mean} ms (au lieu de 1-5 ms)`);
  console.log(` - Max     : ${stats.max} ms`);
  console.log(` - P95     : ${stats.p95} ms`);
  console.log(` - P99     : ${stats.p99} ms`);
  if (stats.max > 200) {
    console.log(` ⚠️ BLOCAGE DE L'EVENT LOOP DÉMONTRÉ : La génération PDF bloque le serveur pendant ${pdfDuration} ms !`);
  }

  return {
    pdfDuration: Number(pdfDuration),
    searchStats: stats
  };
}

async function main() {
  console.log('=== LANCEMENT DE LA SUITE D\'ÉVALUATION DE CHARGE EASYPRESENCE ===\n');

  // Verify server is reachable
  try {
    const health = await fetch(`${BASE_URL}/api/stats`);
    if (!health.ok) throw new Error('Status not ok');
  } catch (err) {
    console.error(`Impossible de se connecter au serveur EasyPresence sur ${BASE_URL}. Le serveur doit être démarré.`);
    process.exit(1);
  }

  const results = {};

  // Scenarios 10, 25, 50, 75, 100
  results.s10 = await runLoadScenario({ virtualUsers: 10, durationSeconds: 5 });
  results.s25 = await runLoadScenario({ virtualUsers: 25, durationSeconds: 5 });
  results.s50 = await runLoadScenario({ virtualUsers: 50, durationSeconds: 8 });
  results.s75 = await runLoadScenario({ virtualUsers: 75, durationSeconds: 6 });
  results.s100 = await runLoadScenario({ virtualUsers: 100, durationSeconds: 6 });

  // Race condition test
  results.race = await testConcurrencyRace();

  // Heavy export interference
  results.interference = await testHeavyExportInterference();

  console.log('\n======================================================');
  console.log('🏁 TOUS LES TESTS DE CHARGE SONT TERMINÉS');
  console.log('======================================================');
}

main().catch(err => {
  console.error('Erreur critique pendant le test :', err);
});
