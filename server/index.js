import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true },
  transports: ['websocket', 'polling'],
});

const DEFAULT_EXPIRY_MINUTES = 30;

const rooms = new Map();

function requireLiveKitEnv(res) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL || 'ws://localhost:7880';
  if (!apiKey || !apiSecret) {
    res.status(500).json({
      error: `LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set on the server (seen apiKey=${apiKey ? 'set' : 'unset'}, apiSecret=${apiSecret ? 'set' : 'unset'})`,
    });
    return null;
  }
  return { apiKey, apiSecret, url };
}

app.post('/livekit/token', async (req, res) => {
  const cfg = requireLiveKitEnv(res);
  if (!cfg) return;

  const room = String(req.body?.room || '').trim();
  const identity = String(req.body?.identity || '').trim();
  const name = String(req.body?.name || '').trim();

  if (!room || !identity) {
    res.status(400).json({ error: 'room and identity are required' });
    return;
  }

  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    name: name || identity,
  });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await at.toJwt();
  res.json({ token: jwt, url: cfg.url });
});

function getRoomBySocket(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.members.has(socket.id)) return [roomId, room];
  }
  return [null, null];
}

function getRoomParticipants(room) {
  if (!room) return [];
  return [...room.members.entries()].map(([id, data]) => ({ id, ...data }));
}

function getPendingList(room) {
  if (!room) return [];
  return [...room.pending.entries()].map(([id, data]) => ({ id, ...data }));
}

function clearExpiryTimer(room) {
  if (room.expiryTimer) {
    clearTimeout(room.expiryTimer);
    room.expiryTimer = null;
  }
}

function scheduleRoomExpiry(roomId, room) {
  clearExpiryTimer(room);
  const minutes = room.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES;
  if (minutes <= 0) return;
  room.expiryTimer = setTimeout(() => {
    rooms.delete(roomId);
  }, minutes * 60 * 1000);
}

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, userName, payload = {}) => {
    if (!roomId || !userName?.trim()) {
      socket.emit('error', { message: 'Room ID and name required' });
      return;
    }
    const name = userName.trim().slice(0, 50);

    if (!rooms.has(roomId)) {
      if (!payload.isCreator || !payload.roomOptions) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const opts = payload.roomOptions;
      const scheduledAt = opts.scheduledAt ? new Date(opts.scheduledAt).getTime() : null;
      if (scheduledAt && Date.now() < scheduledAt) {
        socket.emit('meeting-not-started', { scheduledAt });
        return;
      }
      const room = {
        creatorId: socket.id,
        password: opts.password ? String(opts.password).trim() || null : null,
        scheduledAt,
        expiryMinutes: typeof opts.expiryMinutes === 'number' ? opts.expiryMinutes : DEFAULT_EXPIRY_MINUTES,
        waitingRoom: Boolean(opts.waitingRoom),
        members: new Map(),
        pending: new Map(),
        expiryTimer: null,
        intel: new Map(),
      };
      room.members.set(socket.id, { userName: name });
      room.intel.set(socket.id, { latest_emotion_data: [], emotion_history: [], last_history_sample_time: 0 });
      rooms.set(roomId, room);
      socket.roomId = roomId;
      socket.userName = name;
      socket.isHost = true;
      socket.join(roomId);

      const participants = getRoomParticipants(room);
      socket.emit('room-joined', { roomId, participants, isHost: true, myId: socket.id });
      return;
    }

    const room = rooms.get(roomId);
    clearExpiryTimer(room);

    if (room.password && room.password !== (payload.password || '').trim()) {
      socket.emit('wrong-password');
      return;
    }

    if (room.scheduledAt && Date.now() < room.scheduledAt) {
      socket.emit('meeting-not-started', { scheduledAt: room.scheduledAt });
      return;
    }

    if (room.waitingRoom && socket.id !== room.creatorId) {
      room.pending.set(socket.id, { userName: name });
      socket.roomId = roomId;
      socket.userName = name;
      socket.isHost = false;
      socket.emit('waiting-for-host');
      io.to(room.creatorId).emit('pending-join', { id: socket.id, userName: name });
      return;
    }

    room.members.set(socket.id, { userName: name });
    if (!room.intel) room.intel = new Map();
    room.intel.set(socket.id, { latest_emotion_data: [], emotion_history: [], last_history_sample_time: 0 });
    socket.roomId = roomId;
    socket.userName = name;
    socket.isHost = socket.id === room.creatorId;
    socket.join(roomId);

    const participants = getRoomParticipants(room);
    socket.emit('room-joined', { roomId, participants, isHost: socket.isHost, myId: socket.id });
    socket.to(roomId).emit('participant-joined', { id: socket.id, userName: name });
  });

  socket.on('admit', (peerId) => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!room || room.creatorId !== socket.id) return;
    const pendingData = room.pending.get(peerId);
    if (!pendingData) return;
    room.pending.delete(peerId);
    room.members.set(peerId, pendingData);
    if (room.intel) room.intel.set(peerId, { latest_emotion_data: [], emotion_history: [], last_history_sample_time: 0 });
    const peer = io.sockets.sockets.get(peerId);
    if (peer) {
      peer.join(roomId);
      peer.roomId = roomId;
      peer.userName = pendingData.userName;
      peer.isHost = false;
      const participants = getRoomParticipants(room);
      peer.emit('admitted', { roomId, participants, myId: peer.id });
      socket.to(roomId).emit('participant-joined', { id: peerId, userName: pendingData.userName });
    }
  });

  socket.on('reject', (peerId) => {
    const [, room] = getRoomBySocket(socket);
    if (!room || room.creatorId !== socket.id) return;
    room.pending.delete(peerId);
    io.to(peerId).emit('rejected');
  });

  socket.on('offer', (targetId, sdp) => {
    io.to(targetId).emit('offer', socket.id, sdp);
  });

  socket.on('answer', (targetId, sdp) => {
    io.to(targetId).emit('answer', socket.id, sdp);
  });

  socket.on('ice-candidate', (targetId, candidate) => {
    io.to(targetId).emit('ice-candidate', socket.id, candidate);
  });

  socket.on('chat-message', (text) => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!roomId || !text?.trim()) return;
    io.to(roomId).emit('chat-message', {
      id: socket.id,
      userName: socket.userName,
      text: String(text).trim().slice(0, 2000),
      ts: Date.now(),
    });
  });

  function isHost(socket) {
    const [, room] = getRoomBySocket(socket);
    return room && room.creatorId === socket.id;
  }

  socket.on('mute-all', () => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!roomId || !isHost(socket)) return;
    socket.to(roomId).emit('mute-audio');
  });

  socket.on('mute-peer', (targetId) => {
    const [, room] = getRoomBySocket(socket);
    if (!room || !isHost(socket)) return;
    io.to(targetId).emit('mute-audio-request');
  });

  socket.on('kick', (targetId) => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!room || !isHost(socket)) return;
    room.members.delete(targetId);
    room.pending.delete(targetId);
    const peer = io.sockets.sockets.get(targetId);
    if (peer && peer.roomId === roomId) {
      peer.leave(roomId);
      peer.roomId = null;
      peer.emit('kicked');
      io.to(roomId).emit('participant-left', targetId);
    }
  });

  socket.on('end-meeting', () => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!roomId || !isHost(socket)) return;
    io.in(roomId).emit('meeting-ended');
    clearExpiryTimer(room);
    rooms.delete(roomId);
  });

  socket.on('raise-hand', (raised) => {
    const [roomId] = getRoomBySocket(socket);
    if (!roomId) return;
    io.in(roomId).emit('participant-hand-raised', { id: socket.id, userName: socket.userName, raised: Boolean(raised) });
  });

  socket.on('reaction', (type) => {
    const [roomId] = getRoomBySocket(socket);
    if (!roomId || !type) return;
    const t = String(type).slice(0, 20);
    io.to(roomId).emit('reaction', { fromId: socket.id, userName: socket.userName, type: t });
  });

  socket.on('spotlight', (peerId) => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!roomId || !isHost(socket)) return;
    io.to(roomId).emit('spotlight-changed', peerId || null);
  });

  const INTEL_HISTORY_SAMPLE_INTERVAL_MS = 1000;
  const INTEL_MAX_HISTORY_LENGTH = 24 * 60 * 60;

  socket.on('intel-metrics', (payload) => {
    const [roomId, room] = getRoomBySocket(socket);
    if (!roomId || !room) return;
    const emotion_data = Array.isArray(payload?.emotion_data) ? payload.emotion_data : [];
    if (!room.intel) room.intel = new Map();
    let entry = room.intel.get(socket.id);
    if (!entry) {
      entry = { latest_emotion_data: [], emotion_history: [], last_history_sample_time: 0 };
      room.intel.set(socket.id, entry);
    }
    entry.latest_emotion_data = emotion_data;
    const now = Date.now() / 1000;
    if (now - entry.last_history_sample_time >= INTEL_HISTORY_SAMPLE_INTERVAL_MS / 1000) {
      entry.emotion_history.push(emotion_data);
      entry.last_history_sample_time = now;
      if (entry.emotion_history.length > INTEL_MAX_HISTORY_LENGTH) entry.emotion_history.shift();
    }
    const creatorId = room.creatorId;
    if (!creatorId) return;
    const participants = [...room.intel.entries()].map(([id, data]) => {
      const m = room.members.get(id);
      return {
        participant_id: id,
        name: m?.userName ?? id.slice(0, 8),
        current: data.latest_emotion_data,
        history: data.emotion_history,
      };
    });
    io.to(creatorId).emit('intel-dashboard', { participants });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const wasPending = room.pending.has(socket.id);
    room.members.delete(socket.id);
    room.pending.delete(socket.id);
    if (room.intel) room.intel.delete(socket.id);
    if (wasPending && room.creatorId) {
      io.to(room.creatorId).emit('pending-left', socket.id);
    }

    if (room.members.size === 0 && room.pending.size === 0) {
      clearExpiryTimer(room);
      scheduleRoomExpiry(roomId, room);
      if (!room.expiryTimer) rooms.delete(roomId);
    } else {
      io.to(roomId).emit('participant-left', socket.id);
    }
  });
});

app.get('/health', (_, res) => res.json({ ok: true }));

// Production: serve client build from ../client/dist (same origin for Socket.io)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' || fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Signaling server on http://localhost:${PORT}`);
});
