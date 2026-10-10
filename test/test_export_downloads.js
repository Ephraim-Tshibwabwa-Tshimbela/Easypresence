import assert from 'node:assert';
import * as XLSX from 'xlsx';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 === VALIDATION DU TÉLÉCHARGEMENT DES RAPPORTS EXCEL & PDF ===\n');

  // --- 1. SANS TOKEN -> 401 Unauthorzed ---
  console.log('1️⃣ Test : Tentative d\'export Excel SANS token (comme dans la capture d\'écran)...');
  const resNoAuthExcel = await fetch(`${BASE_URL}/api/export/excel?filter=present_test&session=test`);
  console.log(`   Statut reçu : ${resNoAuthExcel.status}`);
  assert.strictEqual(resNoAuthExcel.status, 401);
  const jsonNoAuth = await resNoAuthExcel.json();
  assert.strictEqual(jsonNoAuth.code, 'ADMIN_UNAUTHORIZED');
  console.log('   ✅ Succès : La sécurité bloque bien l\'accès anonyme !\n');

  // --- 2. Connexion Admin ---
  console.log('2️⃣ Test : Authentification Admin pour générer un jeton...');
  let loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin' })
  });

  let token = null;
  if (loginRes.ok) {
    const loginJson = await loginRes.json();
    token = loginJson.token;
  } else {
    const loginRes2 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin2026' })
    });
    const loginJson2 = await loginRes2.json();
    token = loginJson2.token;
  }
  assert.ok(token, 'Jeton admin valide requis');
  console.log('   ✅ Succès : Session admin active !\n');

  // --- 3. Export Excel AVEC Token en en-tête HTTP (Fetch Blob) ---
  console.log('3️⃣ Test : Téléchargement Excel via En-têtes HTTP (Bearer Token)...');
  const resExcel = await fetch(`${BASE_URL}/api/export/excel?filter=present_test&session=test`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  assert.strictEqual(resExcel.status, 200, 'Doit retourner 200 OK');
  assert.ok(resExcel.headers.get('content-type').includes('openxmlformats-officedocument.spreadsheetml.sheet'), 'Type MIME Excel');
  const dispExcel = resExcel.headers.get('content-disposition');
  assert.ok(dispExcel && dispExcel.includes('.xlsx'), 'Doit avoir l\'extension .xlsx');

  const excelBuffer = Buffer.from(await resExcel.arrayBuffer());
  assert.ok(excelBuffer.length > 500, 'Le fichier Excel ne doit pas être vide');
  const wb = XLSX.read(excelBuffer, { type: 'buffer' });
  assert.ok(wb.SheetNames.length > 0, 'Le classeur doit contenir au moins une feuille');
  console.log(`   Taille du fichier : ${excelBuffer.length} octets | Feuilles : ${wb.SheetNames.join(', ')}`);
  console.log('   ✅ Succès : Le classeur Excel est valide et exploitable !\n');

  // --- 4. Export PDF AVEC Token en en-tête HTTP (Fetch Blob) ---
  console.log('4️⃣ Test : Téléchargement PDF via En-têtes HTTP (Bearer Token)...');
  const resPdf = await fetch(`${BASE_URL}/api/export/pdf?filter=present_test&session=test`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  assert.strictEqual(resPdf.status, 200, 'Doit retourner 200 OK');
  assert.strictEqual(resPdf.headers.get('content-type'), 'application/pdf');
  const dispPdf = resPdf.headers.get('content-disposition');
  assert.ok(dispPdf && dispPdf.includes('.pdf'), 'Doit avoir l\'extension .pdf');

  const pdfBuffer = Buffer.from(await resPdf.arrayBuffer());
  assert.ok(pdfBuffer.length > 1000, 'Le fichier PDF ne doit pas être vide');
  // Check PDF magic header '%PDF-'
  const pdfHeader = pdfBuffer.subarray(0, 5).toString('ascii');
  assert.strictEqual(pdfHeader, '%PDF-', 'Le fichier doit commencer par le magic header PDF');
  console.log(`   Taille du fichier : ${pdfBuffer.length} octets | En-tête : ${pdfHeader}`);
  console.log('   ✅ Succès : Le document PDF est certifié, valide et lisible !\n');

  // --- 5. Export direct avec query param ?admin_token=... (Fallback URL directe) ---
  console.log('5️⃣ Test : Téléchargement via URL directe avec ?admin_token=... (Fallback lien direct)...');
  const resUrlExcel = await fetch(`${BASE_URL}/api/export/excel?filter=all&session=info&admin_token=${token}`);
  assert.strictEqual(resUrlExcel.status, 200);

  const resUrlPdf = await fetch(`${BASE_URL}/api/export/pdf?filter=all&session=info&admin_token=${token}`);
  assert.strictEqual(resUrlPdf.status, 200);
  console.log('   ✅ Succès : Les téléchargements directs avec token en paramètre URL fonctionnent également !\n');

  console.log('🎉 === TOUS LES TESTS D\'EXPORTATION EXCEL ET PDF SONT VALIDÉS (100% SUCCÈS) ===\n');
}

runTests().catch(err => {
  console.error('❌ Échec du test :', err);
  process.exit(1);
});
