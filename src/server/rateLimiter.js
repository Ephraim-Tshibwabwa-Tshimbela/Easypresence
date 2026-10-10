import { getRealSocketIp } from './auth.js';

/**
 * In-memory sliding window rate limiter
 */
class RateLimiter {
  constructor(windowMs = 60 * 1000, maxRequests = 100, message = 'Trop de requêtes. Veuillez patienter.') {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.message = message;
    this.records = new Map(); // ip -> [timestamps]

    // Periodic cleanup of stale IPs
    setInterval(() => {
      const now = Date.now();
      for (const [ip, timestamps] of this.records.entries()) {
        const valid = timestamps.filter(t => now - t < this.windowMs);
        if (valid.length === 0) {
          this.records.delete(ip);
        } else {
          this.records.set(ip, valid);
        }
      }
    }, 60 * 1000);
  }

  middleware() {
    return (req, res, next) => {
      const ip = getRealSocketIp(req);
      const now = Date.now();

      let timestamps = this.records.get(ip) || [];
      // Keep only timestamps within window
      timestamps = timestamps.filter(t => now - t < this.windowMs);

      if (timestamps.length >= this.maxRequests) {
        const oldest = timestamps[0];
        const retryAfterSec = Math.ceil((this.windowMs - (now - oldest)) / 1000);
        res.setHeader('Retry-After', retryAfterSec);
        return res.status(429).json({
          success: false,
          error: this.message,
          retryAfterSeconds: retryAfterSec,
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }

      timestamps.push(now);
      this.records.set(ip, timestamps);
      next();
    };
  }
}

// Global API rate limiter: 300 requests per minute per IP (ample for 50 agents typing searches)
export const apiLimiter = new RateLimiter(60 * 1000, 300, 'Débit de requêtes excessif détecté depuis ce poste. Veuillez patienter quelques secondes.').middleware();

// Strict Auth rate limiter: 10 attempts per minute per IP to protect against brute-force
export const authLimiter = new RateLimiter(60 * 1000, 10, 'Trop de tentatives de connexion administrateur. Veuillez patienter 1 minute.').middleware();

// Export limiter: 6 heavy exports per minute per IP
export const exportLimiter = new RateLimiter(60 * 1000, 6, 'Trop de demandes d\'exportation simultanées. Veuillez patienter avant le prochain téléchargement.').middleware();
