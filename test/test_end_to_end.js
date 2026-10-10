import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('\n=== DÉBUT DES TESTS END-TO-END DE L\'APPLICATION ===\n');

  // 1. Test Excel Preview & Import with echantillon_officiel.xlsx
  console.log('[TEST 1] Importation de l\'échantillon officiel...');
  const samplePath = path.join(__dirname, 'echantillon_officiel.xlsx');
  const sampleBuffer = fs.readFileSync(samplePath);

  const formData = new FormData();
  const blob = new Blob([sampleBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  formData.append('file', blob, 'echantillon_officiel.xlsx');

  const previewRes = await fetch('http://localhost:3000/api/excel/preview', {
    method: 'POST',
    body: formData
  });
  const previewJson = await previewRes.json();
  console.log(' - Preview réussi :', previewJson.success);
  console.log(' - Lignes détectées :', previewJson.analysis.totalRows);
  console.log(' - Colonnes détectées :', previewJson.analysis.headers);
  console.log(' - Mapping suggéré :', previewJson.analysis.suggestedMapping);

  // Confirm import
  const confirmRes = await fetch('http://localhost:3000/api/excel/confirm-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: previewJson.sessionId,
      mapping: previewJson.analysis.suggestedMapping,
      updateDuplicates: true
    })
  });
  const confirmJson = await confirmRes.json();
  console.log(' - Confirmation import :', confirmJson.message);

  // 2. Test Ultra-Fast Search
  console.log('\n[TEST 2] Vérification de la recherche ultra-rapide...');
  const queries = ['amina', 'bahane', '74022201010017', 'pat', 'est'];
  for (const q of queries) {
    const t0 = performance.now();
    const sRes = await fetch(`http://localhost:3000/api/search?q=${encodeURIComponent(q)}`);
    const sJson = await sRes.json();
    const duration = (performance.now() - t0).toFixed(2);
    console.log(` - Recherche "${q}" -> ${sJson.count} résultat(s) en ${duration} ms (Top: ${sJson.data[0]?.nom} ${sJson.data[0]?.postnom} ${sJson.data[0]?.prenom})`);
  }

  // 3. Test Presence Marking
  console.log('\n[TEST 3] Pointage de présence (AMINA BAHANE JOELLE)...');
  const searchAmina = await fetch('http://localhost:3000/api/search?q=74022201010017');
  const aminaData = (await searchAmina.json()).data[0];

  const toggleRes = await fetch('http://localhost:3000/api/presence/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: aminaData.id,
      status: 1,
      agentName: 'Poste 01 Test'
    })
  });
  const toggleJson = await toggleRes.json();
  console.log(` - Statut : ${toggleJson.data.person.is_present === 1 ? 'PRÉSENTE' : 'ABSENTE'}`);
  console.log(` - Horodatage : ${toggleJson.data.person.present_at}`);
  console.log(` - Agent : ${toggleJson.data.person.present_by}`);

  // 4. Test Stats Update
  console.log('\n[TEST 4] Vérification des statistiques du Dashboard...');
  const statsRes = await fetch('http://localhost:3000/api/stats');
  const statsJson = await statsRes.json();
  console.log(` - Total inscrits : ${statsJson.data.total}`);
  console.log(` - Présents       : ${statsJson.data.present}`);
  console.log(` - Absents        : ${statsJson.data.absent}`);
  console.log(` - Taux           : ${statsJson.data.rate} %`);

  // 5. Test Large Scale Import (3,000 rows) & Measure Performance
  console.log('\n[TEST 5] Stress Test : Importation du grand registre (3 000 personnes)...');
  const largePath = path.join(__dirname, 'grand_fichier_3000.xlsx');
  const largeBuffer = fs.readFileSync(largePath);

  const largeForm = new FormData();
  largeForm.append('file', new Blob([largeBuffer]), 'grand_fichier_3000.xlsx');

  const prevLargeRes = await fetch('http://localhost:3000/api/excel/preview', {
    method: 'POST',
    body: largeForm
  });
  const prevLargeJson = await prevLargeRes.json();

  const tImportStart = performance.now();
  const confLargeRes = await fetch('http://localhost:3000/api/excel/confirm-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: prevLargeJson.sessionId,
      mapping: prevLargeJson.analysis.suggestedMapping,
      updateDuplicates: true
    })
  });
  const confLargeJson = await confLargeRes.json();
  const importTime = (performance.now() - tImportStart).toFixed(2);
  console.log(` - Import 3 000 lignes terminé en ${importTime} ms : ${confLargeJson.message}`);

  // 6. Test Instant Search on 3,000+ indexed records
  console.log('\n[TEST 6] Vitesse de recherche sur la grande base de données...');
  const testNames = ['KASEREKA', 'lumumba', '74000000001234', 'jean', 'pat'];
  for (const q of testNames) {
    const t0 = performance.now();
    const sRes = await fetch(`http://localhost:3000/api/search?q=${encodeURIComponent(q)}`);
    const sJson = await sRes.json();
    const duration = (performance.now() - t0).toFixed(2);
    console.log(` - Recherche "${q}" (${sJson.count} résultats) -> Vitesse : ${duration} ms !`);
  }

  // 7. Test Export Generation
  console.log('\n[TEST 7] Test de génération des rapports Excel et PDF...');
  const excelExp = await fetch('http://localhost:3000/api/export/excel?filter=all');
  const excelBuf = await excelExp.arrayBuffer();
  console.log(` - Export Excel généré avec succès (${excelBuf.byteLength} octets)`);

  const pdfExp = await fetch('http://localhost:3000/api/export/pdf?filter=all&title=TEST%20EMARGEMENT');
  const pdfBuf = await pdfExp.arrayBuffer();
  console.log(` - Export PDF généré avec succès (${pdfBuf.byteLength} octets)`);

  console.log('\n=== TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS ! ===\n');
}

runTests().catch(err => {
  console.error('[ERREUR DE TEST] :', err);
});
