import { WebSocketServer, WebSocket } from 'ws';
import { getActiveDay } from './db.js';
import { isValidAdminToken } from './auth.js';

let wss = null;
const activeSockets = new Map(); // ws -> { ws, clientId, ip }
// Registry of all known clients/workstations: clientId -> stationRecord
const knownStations = new Map();

/**
 * Normalizes IP address
 */
export function cleanIp(rawIp) {
  if (!rawIp) return '127.0.0.1';
  let ip = String(rawIp).trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1' || ip === '127.0.0.1') {
    return '127.0.0.1';
  }
  return ip;
}

/**
 * Extracts the real client IP, respecting reverse proxies (Render, Heroku, Cloudflare, Nginx)
 */
export function getClientIpFromReq(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return cleanIp(first);
  }
  return cleanIp(req.socket?.remoteAddress || req.connection?.remoteAddress);
}

/**
 * Checks if the IP belongs to localhost host
 */
function isHostIp(ip) {
  const c = cleanIp(ip);
  return c === '127.0.0.1' || c === 'localhost';
}

/**
 * Broadcasts an event to all connected clients
 */
export function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);

  for (const client of activeSockets.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (_) {}
    }
  }
}

/**
 * Broadcasts the updated client list to admin and anyone listening
 */
export function broadcastClientsList() {
  broadcast({
    type: 'CLIENTS_UPDATED',
    data: {
      clients: getConnectedClientsList(),
      count: getOnlineClientsCount()
    }
  });
}

/**
 * Returns full list of connected and recent workstations/users
 */
export function getConnectedClientsList() {
  const list = [];
  const now = new Date();

  for (const [, station] of knownStations.entries()) {
    const isOnline = Boolean(station.isOnline);
    const socketCount = station.sockets ? station.sockets.size : 0;

    list.push({
      id: station.id,
      clientId: station.id,
      ip: station.ip || '127.0.0.1',
      name: station.name || (station.role === 'ADMIN' ? 'PC-Admin' : 'Poste Opérateur'),
      status: isOnline ? 'Connecté' : 'Déconnecté',
      isOnline: isOnline,
      role: station.role || 'OPERATEUR',
      deviceType: station.deviceInfo?.deviceType || 'desktop',
      deviceLabel: station.deviceInfo?.label || '💻 Ordinateur',
      deviceInfo: station.deviceInfo || null,
      connectedAt: station.connectedAt || now.toISOString(),
      lastActivity: station.lastActivity || station.connectedAt || now.toISOString(),
      socketCount
    });
  }

  // Sort: online first, then ADMIN first, then by most recent activity
  list.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
    if (b.role === 'ADMIN' && a.role !== 'ADMIN') return 1;
    return new Date(b.lastActivity) - new Date(a.lastActivity);
  });

  return list;
}

/**
 * Count how many distinct clients are currently online
 */
export function getOnlineClientsCount() {
  let count = 0;
  for (const [, s] of knownStations.entries()) {
    if (s.isOnline) count++;
  }
  return count;
}

/**
 * Updates or sets the workstation name
 */
export function setStationName(clientIdOrIp, name) {
  const safeId = String(clientIdOrIp).trim();
  const safeName = String(name || '').trim().substring(0, 64);

  let station = knownStations.get(safeId);
  if (!station) {
    // Check if matching by IP
    for (const [, s] of knownStations.entries()) {
      if (s.ip === safeId) {
        station = s;
        break;
      }
    }
  }

  if (station) {
    station.name = safeName;
    station.lastActivity = new Date().toISOString();
  } else {
    station = {
      id: safeId,
      name: safeName,
      ip: cleanIp(safeId),
      role: 'OPERATEUR',
      isOnline: false,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      sockets: new Set(),
      disconnectTimer: null
    };
    knownStations.set(safeId, station);
  }

  broadcastClientsList();
}

/**
 * Records activity from a client (e.g. search, presence mark, ping)
 */
export function recordClientActivity(clientIdOrIp, extraName = null, clientIp = null, deviceInfo = null) {
  const safeId = String(clientIdOrIp || 'default').trim();
  const nowIso = new Date().toISOString();

  let station = knownStations.get(safeId);
  if (!station && clientIp) {
    for (const [, s] of knownStations.entries()) {
      if (s.ip === clientIp) {
        station = s;
        break;
      }
    }
  }

  if (station) {
    station.lastActivity = nowIso;
    if (clientIp) station.ip = cleanIp(clientIp);
    if (extraName && (!station.name || station.name.startsWith('Poste-'))) station.name = extraName;
    if (deviceInfo && !station.deviceInfo) station.deviceInfo = deviceInfo;
  } else {
    knownStations.set(safeId, {
      id: safeId,
      name: extraName || `Poste-${safeId.substring(0, 8)}`,
      role: 'OPERATEUR',
      ip: cleanIp(clientIp || safeId),
      deviceInfo: deviceInfo || null,
      isOnline: true,
      connectedAt: nowIso,
      lastActivity: nowIso,
      sockets: new Set(),
      disconnectTimer: null
    });
  }
}

/**
 * Initializes the WebSocket server attached to the HTTP server
 */
export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientIp = getClientIpFromReq(req);
    const nowIso = new Date().toISOString();

    let clientKey = clientIp; // will be updated upon IDENTIFY
    let currentStation = null;

    const socketMeta = {
      ws,
      ip: clientIp,
      clientId: null,
      role: isHostIp(clientIp) ? 'ADMIN' : 'OPERATEUR',
      connectedAt: nowIso,
      lastActivity: nowIso
    };
    activeSockets.set(ws, socketMeta);

    const activeDay = getActiveDay();
    const activeDayLabel = activeDay === 'test' ? 'Journée de test' : "Journée d'information";

    // Send initial ack
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      data: {
        message: 'Connecté au serveur EasyPresence',
        ip: clientIp,
        clientCount: getOnlineClientsCount() || activeSockets.size,
        activeDay,
        activeDayLabel
      }
    }));

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        const now = new Date().toISOString();
        socketMeta.lastActivity = now;

        if (payload.type === 'IDENTIFY') {
          const { clientId, name, role, token, deviceInfo } = payload;
          const safeId = (clientId && typeof clientId === 'string') ? clientId.trim() : clientIp;
          clientKey = safeId;
          socketMeta.clientId = safeId;

          // Authenticate role securely
          let verifiedRole = 'OPERATEUR';
          if (role === 'ADMIN' && token && isValidAdminToken(token)) {
            verifiedRole = 'ADMIN';
          } else if (isHostIp(clientIp) && !role) {
            verifiedRole = 'ADMIN';
          }
          socketMeta.role = verifiedRole;

          // Retrieve or create station record
          currentStation = knownStations.get(safeId);
          if (!currentStation) {
            currentStation = {
              id: safeId,
              clientId: safeId,
              name: name || (verifiedRole === 'ADMIN' ? 'PC-Admin' : `Poste-${safeId.substring(0, 6)}`),
              role: verifiedRole,
              ip: clientIp,
              deviceInfo: deviceInfo || null,
              isOnline: true,
              connectedAt: now,
              lastActivity: now,
              sockets: new Set(),
              disconnectTimer: null
            };
            knownStations.set(safeId, currentStation);
          } else {
            // Cancel grace period disconnect timer if reconnecting
            if (currentStation.disconnectTimer) {
              clearTimeout(currentStation.disconnectTimer);
              currentStation.disconnectTimer = null;
            }
            currentStation.isOnline = true;
            currentStation.ip = clientIp;
            currentStation.lastActivity = now;
            if (name) currentStation.name = name;
            if (verifiedRole === 'ADMIN') currentStation.role = 'ADMIN';
            if (deviceInfo) currentStation.deviceInfo = deviceInfo;
          }

          if (!currentStation.sockets) currentStation.sockets = new Set();
          currentStation.sockets.add(ws);

          broadcastClientsList();
        } else if (payload.type === 'PING') {
          if (currentStation) {
            if (currentStation.disconnectTimer) {
              clearTimeout(currentStation.disconnectTimer);
              currentStation.disconnectTimer = null;
            }
            currentStation.isOnline = true;
            currentStation.lastActivity = now;
          }
          ws.send(JSON.stringify({ type: 'PONG' }));
        } else if (payload.type === 'GOODBYE') {
          if (currentStation) {
            currentStation.lastActivity = now;
            currentStation.sockets?.delete(ws);
            if (!currentStation.sockets || currentStation.sockets.size === 0) {
              currentStation.isOnline = false;
              broadcastClientsList();
            }
          }
        }
      } catch (_) {}
    });

    const handleDisconnect = () => {
      activeSockets.delete(ws);

      if (currentStation) {
        currentStation.lastActivity = new Date().toISOString();
        currentStation.sockets?.delete(ws);

        // Anti-flapping: 25 seconds grace period before marking offline
        if (!currentStation.sockets || currentStation.sockets.size === 0) {
          if (currentStation.disconnectTimer) clearTimeout(currentStation.disconnectTimer);

          currentStation.disconnectTimer = setTimeout(() => {
            currentStation.disconnectTimer = null;
            if (!currentStation.sockets || currentStation.sockets.size === 0) {
              currentStation.isOnline = false;
              broadcastClientsList();
            }
          }, 25000);
        }
      }

      broadcast({
        type: 'CLIENT_COUNT',
        data: { count: getOnlineClientsCount() }
      });
    };

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
  });

  // Background sweeper: clean up stale connections (no heartbeat > 60s & 0 sockets)
  setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (const [, station] of knownStations.entries()) {
      if (station.isOnline) {
        const lastActTime = new Date(station.lastActivity).getTime();
        const hasOpenSockets = station.sockets && station.sockets.size > 0;

        if (!hasOpenSockets && now - lastActTime > 60000) {
          station.isOnline = false;
          changed = true;
        }
      }
    }

    if (changed) {
      broadcastClientsList();
    }
  }, 15000);

  return wss;
}

/**
 * Returns current number of active connections
 */
export function getActiveClientCount() {
  return getOnlineClientsCount() || activeSockets.size;
}
