import crypto from 'node:crypto';
import {
  getSetting,
  setSetting,
  saveAdminSession,
  getAdminSession,
  deleteAdminSession,
  clearAllAdminSessions,
  cleanExpiredAdminSessions
} from './db.js';

// Active admin sessions: token -> { createdAt, expiresAt, ip }
const adminSessions = new Map();

// Failed login attempts tracker: ip -> { count, lockedUntil }
const loginAttempts = new Map();

const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Password hashing helpers using native crypto
export function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Ensures an admin password exists in the database settings.
 * If not set, initializes a secure default password and logs it clearly.
 */
export function initAdminAuth() {
  const currentHash = getSetting('admin_password_hash');
  if (!currentHash) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin2026';
    const newHash = hashPassword(defaultPassword);
    setSetting('admin_password_hash', newHash);
    console.log('\n------------------------------------------------------------');
    console.log('🔐 [SÉCURITÉ] Mot de passe Administrateur par défaut défini :');
    console.log(`   Mot de passe : ${defaultPassword}`);
    console.log('   (Vous pouvez le modifier à tout moment dans Paramètres > Sécurité)');
    console.log('------------------------------------------------------------\n');
  }
}

/**
 * Returns the verified physical IP from the connection socket or reverse proxy.
 */
export function getRealSocketIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    let ip = String(forwarded).split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    if (ip === '::1') ip = '127.0.0.1';
    if (ip) return ip;
  }
  let ip = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip;
}

/**
 * Authenticates the admin with password.
 */
export function loginAdmin(password, clientIp) {
  const now = Date.now();
  const attemptInfo = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };

  // Check lockout
  if (attemptInfo.lockedUntil > now) {
    const remainingSec = Math.ceil((attemptInfo.lockedUntil - now) / 1000);
    throw new Error(`Trop de tentatives infructueuses. Compte temporairement verrouillé pendant encore ${remainingSec} secondes.`);
  }

  const storedHash = getSetting('admin_password_hash');
  const isValid = verifyPassword(password, storedHash);

  if (!isValid) {
    attemptInfo.count++;
    if (attemptInfo.count >= MAX_FAILED_ATTEMPTS) {
      attemptInfo.lockedUntil = now + LOCKOUT_DURATION_MS;
      attemptInfo.count = 0;
      console.warn(`🚨 [SÉCURITÉ] Blocage IP activé pour ${clientIp} suite à 5 échecs consécutifs d'authentification admin.`);
    }
    loginAttempts.set(clientIp, attemptInfo);
    throw new Error('Mot de passe administrateur incorrect.');
  }

  // Reset failed attempts on success
  loginAttempts.delete(clientIp);

  // Generate cryptographic session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + SESSION_LIFETIME_MS;

  const sessionData = {
    token,
    ip: clientIp,
    createdAt: now,
    expiresAt
  };

  adminSessions.set(token, sessionData);
  // Persist session to SQLite so restarts / redeploys don't invalidate it
  saveAdminSession(token, clientIp, now, expiresAt);

  console.log(`🔑 [SÉCURITÉ] Session administrateur ouverte avec succès pour l'IP ${clientIp}`);

  return {
    token,
    expiresAt,
    expiresInHours: 12
  };
}

/**
 * Logs out an admin session.
 */
export function logoutAdmin(token) {
  if (token) {
    const cleanToken = token.trim();
    adminSessions.delete(cleanToken);
    deleteAdminSession(cleanToken);
    return true;
  }
  return false;
}

/**
 * Changes the admin password.
 */
export function changeAdminPassword(currentPassword, newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit comporter au moins 6 caractères.');
  }

  const storedHash = getSetting('admin_password_hash');
  if (!verifyPassword(currentPassword, storedHash)) {
    throw new Error('Le mot de passe actuel est incorrect.');
  }

  const newHash = hashPassword(newPassword);
  setSetting('admin_password_hash', newHash);

  // Invalidate all existing sessions for security
  adminSessions.clear();
  clearAllAdminSessions();

  console.log('🔒 [SÉCURITÉ] Mot de passe administrateur modifié avec succès. Toutes les sessions actives ont été révoquées.');
  return true;
}

export function isValidAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  let session = adminSessions.get(cleanToken);

  if (!session) {
    // Check SQLite persistence
    const dbSession = getAdminSession(cleanToken);
    if (dbSession) {
      session = {
        token: dbSession.token,
        ip: dbSession.client_ip,
        createdAt: dbSession.created_at,
        expiresAt: dbSession.expires_at
      };
      adminSessions.set(cleanToken, session);
    }
  }

  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(cleanToken);
    deleteAdminSession(cleanToken);
    return false;
  }
  return true;
}

/**
 * Extracts and verifies the admin token from an incoming HTTP request.
 * Checks Authorization header, X-Admin-Token header, Cookies, and query parameter.
 */
export function verifyAdminRequest(req) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  } else if (req.query?.admin_token) {
    token = String(req.query.admin_token).trim();
  } else if (req.headers?.cookie) {
    const match = req.headers.cookie.match(/(?:^|; )admin_token=([^;]*)/);
    if (match && match[1]) {
      token = decodeURIComponent(match[1]).trim();
    }
  }

  return isValidAdminToken(token);
}

/**
 * Strict Admin Authorization Middleware.
 * Rejects any request that does not present a valid, unexpired Admin token.
 */
export function requireAdmin(req, res, next) {
  const realIp = getRealSocketIp(req);

  if (verifyAdminRequest(req)) {
    return next();
  }

  console.warn(`🛑 [ACCÈS REFUSÉ] Tentative d'accès non autorisé à la route admin [${req.method}] ${req.originalUrl} depuis l'IP ${realIp}`);

  return res.status(401).json({
    success: false,
    error: 'Accès réservé à l\'administrateur. Veuillez vous authentifier avec le mot de passe administrateur.',
    code: 'ADMIN_UNAUTHORIZED'
  });
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (now > session.expiresAt) {
      adminSessions.delete(token);
    }
  }
  cleanExpiredAdminSessions();
}, 15 * 60 * 1000);
