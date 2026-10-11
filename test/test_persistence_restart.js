import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function testPersistence() {
  console.log('🧪 Test de persistance des sessions SQLite...');
  
  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin2026' })
  });
  const { token } = await loginRes.json();
  assert.ok(token);

  // 2. Cookie test
  const cookieHeader = loginRes.headers.get('set-cookie');
  console.log('   Set-Cookie reçu :', cookieHeader ? 'Oui' : 'Non');
  assert.ok(cookieHeader && cookieHeader.includes('admin_token='));

  // 3. Request using cookie only
  const cookieVal = cookieHeader.split(';')[0];
  const roleRes = await fetch(`${BASE_URL}/api/auth/role`, {
    headers: { 'Cookie': cookieVal }
  });
  const roleJson = await roleRes.json();
  assert.strictEqual(roleJson.data.isAdmin, true, 'L\'authentification par Cookie doit reconnaître l\'Admin');
  console.log('   ✅ Succès : L\'authentification par Cookie est pleinement fonctionnelle !');
}

testPersistence().catch(err => {
  console.error('❌ Échec :', err);
  process.exit(1);
});
