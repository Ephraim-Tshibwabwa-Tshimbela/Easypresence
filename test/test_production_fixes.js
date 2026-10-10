import assert from 'node:assert';
import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

async function runTests() {
  console.log('🧪 === DÉBUT DES TESTS DE VALIDATION DES CORRECTIONS PRODUCTION ===\n');

  // --- TEST 1: Excel preview without admin auth should fail (401) ---
  console.log('1️⃣ Test : Tentative d\'import Excel SANS jeton administrateur...');
  const sampleCsv = 'matricule,nom,prenom,sexe\nTEST01,KABAMBA,Ephraim,M\n';
  const blobNoAuth = new Blob([sampleCsv], { type: 'text/csv' });
  const fdNoAuth = new FormData();
  fdNoAuth.append('file', blobNoAuth, 'test.csv');

  const resNoAuth = await fetch(`${BASE_URL}/api/excel/preview`, {
    method: 'POST',
    body: fdNoAuth
  });

  console.log(`   Statut HTTP reçu : ${resNoAuth.status}`);
  assert.strictEqual(resNoAuth.status, 401, 'L\'accès non authentifié doit retourner 401');
  const jsonNoAuth = await resNoAuth.json();
  assert.strictEqual(jsonNoAuth.code, 'ADMIN_UNAUTHORIZED');
  console.log('   ✅ Succès : La sécurité bloque bien l\'import non autorisé !\n');

  // --- TEST 2: Admin login to obtain valid token ---
  console.log('2️⃣ Test : Connexion Administrateur...');
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
    // Try with default password 'admin2026'
    const loginRes2 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin2026' })
    });
    const loginJson2 = await loginRes2.json();
    token = loginJson2.token;
  }

  assert.ok(token, 'Le jeton administrateur doit être généré');
  console.log('   ✅ Succès : Administrateur authentifié avec jeton valide !\n');

  // --- TEST 3: Excel preview WITH valid admin token ---
  console.log('3️⃣ Test : Import Excel AVEC jeton administrateur...');
  const blobAuth = new Blob([sampleCsv], { type: 'text/csv' });
  const fdAuth = new FormData();
  fdAuth.append('file', blobAuth, 'test.csv');

  const resAuth = await fetch(`${BASE_URL}/api/excel/preview`, {
    method: 'POST',
    body: fdAuth,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`   Statut HTTP reçu : ${resAuth.status}`);
  assert.strictEqual(resAuth.status, 200, 'L\'import avec jeton admin doit retourner 200');
  const jsonAuth = await resAuth.json();
  assert.strictEqual(jsonAuth.success, true);
  assert.ok(jsonAuth.sessionId, 'Une session d\'importation doit être créée');
  console.log(`   ✅ Succès : Fichier Excel prévisualisé avec succès (${jsonAuth.analysis?.totalRows || 1} ligne détectée) !\n`);

  // --- TEST 4: Tracking online users across different clients via WebSocket ---
  console.log('4️⃣ Test : Suivi en direct des utilisateurs (multi-appareils / multi-réseaux)...');

  // Client 1: Smartphone Android (Opérateur)
  const wsOperator = new WebSocket(WS_URL);
  await new Promise((resolve) => wsOperator.on('open', resolve));

  wsOperator.send(JSON.stringify({
    type: 'IDENTIFY',
    clientId: 'device_mobile_android_01',
    name: 'Poste Mobile 01 (Entrée)',
    role: 'OPERATEUR',
    token: null,
    deviceInfo: {
      deviceType: 'mobile',
      os: 'Android',
      browser: 'Chrome',
      label: '📱 Android • Chrome'
    }
  }));

  // Client 2: Ordinateur portable (Admin)
  const wsAdmin = new WebSocket(WS_URL);
  await new Promise((resolve) => wsAdmin.on('open', resolve));

  wsAdmin.send(JSON.stringify({
    type: 'IDENTIFY',
    clientId: 'device_desktop_admin_01',
    name: 'PC Direction (Admin)',
    role: 'ADMIN',
    token: token,
    deviceInfo: {
      deviceType: 'desktop',
      os: 'Windows',
      browser: 'Edge',
      label: '💻 Windows • Edge'
    }
  }));

  // Wait 250ms for message processing
  await new Promise(r => setTimeout(r, 250));

  // --- TEST 5: Query connected clients list via protected Admin endpoint ---
  console.log('5️⃣ Test : Récupération de la liste des utilisateurs connectés...');
  const clientsRes = await fetch(`${BASE_URL}/api/admin/clients`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  assert.strictEqual(clientsRes.status, 200);
  const clientsJson = await clientsRes.json();
  assert.strictEqual(clientsJson.success, true);
  const clients = clientsJson.data;

  console.log(`   Nombre d'utilisateurs listés : ${clients.length}`);
  const opClient = clients.find(c => c.clientId === 'device_mobile_android_01');
  const admClient = clients.find(c => c.clientId === 'device_desktop_admin_01');

  assert.ok(opClient, 'Le client opérateur mobile doit être présent');
  assert.strictEqual(opClient.isOnline, true);
  assert.strictEqual(opClient.role, 'OPERATEUR');
  assert.strictEqual(opClient.deviceLabel, '📱 Android • Chrome');
  console.log(`   - Opérateur : ${opClient.name} | Statut: ${opClient.status} | Rôle: ${opClient.role} | Appareil: ${opClient.deviceLabel}`);

  assert.ok(admClient, 'Le client administrateur doit être présent');
  assert.strictEqual(admClient.isOnline, true);
  assert.strictEqual(admClient.role, 'ADMIN');
  assert.strictEqual(admClient.deviceLabel, '💻 Windows • Edge');
  console.log(`   - Administrateur : ${admClient.name} | Statut: ${admClient.status} | Rôle: ${admClient.role} | Appareil: ${admClient.deviceLabel}`);

  console.log('   ✅ Succès : Tous les utilisateurs multi-réseaux sont correctement suivis et typés !\n');

  // --- TEST 6: Heartbeat PING / PONG test ---
  console.log('6️⃣ Test : Heartbeat PING / PONG en continu...');
  const pongPromise = new Promise((resolve) => {
    wsOperator.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.type === 'PONG') resolve(true);
    });
  });

  wsOperator.send(JSON.stringify({ type: 'PING', clientId: 'device_mobile_android_01' }));
  const pongReceived = await pongPromise;
  assert.strictEqual(pongReceived, true, 'Le serveur doit répondre au heartbeat PING avec PONG');
  console.log('   ✅ Succès : Le serveur maintient la connexion vivante avec PONG !\n');

  // Cleanup WebSockets
  wsOperator.close();
  wsAdmin.close();

  console.log('🎉 === TOUS LES TESTS ONT RÉUSSI AVEC SUCCÈS (100% CONFORMES) ===\n');
}

runTests().catch(err => {
  console.error('❌ Échec du test :', err);
  process.exit(1);
});
