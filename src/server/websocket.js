import { WebSocketServer, WebSocket } from 'ws';
import { getActiveDay } from './db.js';

let wss = null;
const activeSockets = new Map(); // ws -> socketMeta
// Global registry of all known workstations: ip -> workstationMeta
const knownStations = new Map();

/**
 * Normalizes IP address
 */
function cleanIp(rawIp) {
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
 * Checks if the IP belongs to host
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
      count: activeSockets.size
    }
  });
}

/**
 * Returns full list of connected and recent workstations
 */
export function getConnectedClientsList() {
  const list = [];
  const now = new Date();

  for (const [ip, station] of knownStations.entries()) {
    // Check if there is at least one active socket for this IP
    let isOnline = false;
    let socketCount = 0;
    for (const [ws, meta] of activeSockets.entries()) {
      if (meta.ip === ip && ws.readyState === WebSocket.OPEN) {
        isOnline = true;
        socketCount++;
      }
    }

    list.push({
      id: ip,
      ip: ip,
      name: station.name || (station.role === 'ADMIN' ? 'PC-Admin (Hôte)' : `Poste-${ip.split('.').pop() || 'Client'}`),
      status: isOnline ? 'Connecté' : 'Déconnecté',
      isOnline: isOnline,
      role: station.role || (isHostIp(ip) ? 'ADMIN' : 'CLIENT'),
      connectedAt: station.connectedAt || now.toISOString(),
      lastActivity: station.lastActivity || station.connectedAt || now.toISOString(),
      socketCount
    });
  }

  // Sort: online first, then ADMIN first, then by last activity
  list.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
    if (b.role === 'ADMIN' && a.role !== 'ADMIN') return 1;
    return new Date(b.lastActivity) - new Date(a.lastActivity);
  });

  return list;
}

/**
 * Updates or sets the workstation name for an IP
 */
export function setStationName(ip, name) {
  const cIp = cleanIp(ip);
  const existing = knownStations.get(cIp) || {
    ip: cIp,
    role: isHostIp(cIp) ? 'ADMIN' : 'CLIENT',
    connectedAt: new Date().toISOString()
  };
  existing.name = name;
  existing.lastActivity = new Date().toISOString();
  knownStations.set(cIp, existing);

  // Also update active sockets meta
  for (const [, meta] of activeSockets.entries()) {
    if (meta.ip === cIp) {
      meta.name = name;
      meta.lastActivity = existing.lastActivity;
    }
  }

  broadcastClientsList();
}

/**
 * Records activity from an IP (e.g. search, presence mark, ping)
 */
export function recordClientActivity(rawIp, extraName = null) {
  const ip = cleanIp(rawIp);
  const nowIso = new Date().toISOString();
  const station = knownStations.get(ip);
  if (station) {
    station.lastActivity = nowIso;
    if (extraName && !station.name) station.name = extraName;
  } else {
    knownStations.set(ip, {
      ip,
      name: extraName || (isHostIp(ip) ? 'PC-Admin (Hôte)' : `Poste-${ip.split('.').pop()}`),
      role: isHostIp(ip) ? 'ADMIN' : 'CLIENT',
      connectedAt: nowIso,
      lastActivity: nowIso
    });
  }
}

/**
 * Initializes the WebSocket server attached to the HTTP server
 */
export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const rawIp = req.socket?.remoteAddress || '127.0.0.1';
    const ip = cleanIp(rawIp);
    const isHost = isHostIp(ip);
    const role = isHost ? 'ADMIN' : 'CLIENT';
    const nowIso = new Date().toISOString();

    // Check if station was already registered
    let station = knownStations.get(ip);
    if (!station) {
      station = {
        ip,
        name: isHost ? 'PC-Admin (Hôte)' : `Poste-${ip.split('.').pop()}`,
        role,
        connectedAt: nowIso,
        lastActivity: nowIso
      };
      knownStations.set(ip, station);
    } else {
      station.connectedAt = nowIso;
      station.lastActivity = nowIso;
    }

    const socketMeta = {
      ip,
      role,
      name: station.name,
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
        ip,
        role,
        name: station.name,
        clientCount: activeSockets.size,
        activeDay,
        activeDayLabel
      }
    }));

    // Broadcast updated client count and clients list
    broadcast({
      type: 'CLIENT_COUNT',
      data: { count: activeSockets.size }
    });
    broadcastClientsList();

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        const now = new Date().toISOString();
        socketMeta.lastActivity = now;
        if (station) station.lastActivity = now;

        if (payload.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        } else if (payload.type === 'IDENTIFY') {
          // Client provides its workstation name
          if (payload.name && typeof payload.name === 'string') {
            const cleanName = payload.name.trim().substring(0, 64);
            socketMeta.name = cleanName;
            if (station) station.name = cleanName;
            broadcastClientsList();
          }
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      if (station) {
        station.lastActivity = new Date().toISOString();
      }
      broadcast({
        type: 'CLIENT_COUNT',
        data: { count: activeSockets.size }
      });
      broadcastClientsList();
    });

    ws.on('error', () => {
      activeSockets.delete(ws);
      broadcastClientsList();
    });
  });

  return wss;
}

/**
 * Returns current number of active connections
 */
export function getActiveClientCount() {
  return activeSockets.size;
}
