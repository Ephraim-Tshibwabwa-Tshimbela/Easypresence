import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';
import { initWebSocketServer } from './websocket.js';
import { getLocalIpAddresses, getPrimaryLanIp } from './network.js';
import { initAdminAuth } from './auth.js';
import { apiLimiter } from './rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize admin authentication credentials on startup
initAdminAuth();

// Initialize real-time WebSocket server
initWebSocketServer(server);

// Security Headers (Hardened for offline LAN web application)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:;"
  );
  next();
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS for local development / LAN flexibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Rate limiting and mounting API routes
app.use('/api', apiLimiter, routes);

// Serve static frontend client
const publicDir = path.resolve(__dirname, '../../public');
app.use(express.static(publicDir));

// Fallback to index.html for SPA client navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  next();
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all interfaces for LAN access

server.listen(PORT, HOST, () => {
  const primaryIp = getPrimaryLanIp();
  const allIps = getLocalIpAddresses();
  const physicalIps = allIps.filter(i => !i.isVirtual);
  const virtualIps = allIps.filter(i => i.isVirtual);

  console.log('\n============================================================');
  console.log('   EASYPRESENCE — GESTION DE PRÉSENCE MULTI-POSTES');
  console.log('   Système 100% Web - Réseau Local (LAN) & Hors-Ligne');
  console.log('============================================================');
  console.log(` > Accès Local (ce PC hôte)   : http://localhost:${PORT}`);
  console.log(` > Accès Réseau LAN (Wi-Fi)   : http://${primaryIp}:${PORT}`);
  if (physicalIps.length > 1) {
    console.log('   Autres adresses physiques :');
    physicalIps.slice(1).forEach(i => console.log(`     - [${i.interface}] http://${i.ip}:${PORT}`));
  }
  if (virtualIps.length > 0) {
    console.log('   Cartes virtuelles détectées (ignorées pour le LAN) :');
    virtualIps.forEach(i => console.log(`     - [${i.interface}] ${i.ip} (virtuel)`));
  }
  console.log('------------------------------------------------------------');
  console.log('   Partagez l\'adresse Wi-Fi ci-dessus avec les autres PC');
  console.log('   connectés sur le même réseau pour collaborer en direct !');
  console.log('============================================================\n');
});

export default { app, server };
