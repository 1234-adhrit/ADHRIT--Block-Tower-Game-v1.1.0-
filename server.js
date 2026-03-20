const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX_PATH = path.join(__dirname, 'index.html');

const profiles = new Map();
const globalScores = [];
const roomHistory = new Map();
const roomHistoryGlobal = [];

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(INDEX_PATH, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Failed to load index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.url.startsWith('/api/profile')) {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const name = (url.searchParams.get('name') || '').trim();
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'name required' }));
        return;
      }
      const existing = profiles.get(name.toLowerCase()) || { name, bestScore: 0, wins: 0, matches: 0 };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, profile: existing }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const name = String(data.name || '').trim();
          if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'name required' }));
            return;
          }
          const key = name.toLowerCase();
          const current = profiles.get(key) || { name, bestScore: 0, wins: 0, matches: 0 };
          const next = {
            name,
            bestScore: Math.max(current.bestScore || 0, Number(data.bestScore) || 0),
            wins: Math.max(current.wins || 0, Number(data.wins) || 0),
            matches: Math.max(current.matches || 0, Number(data.matches) || 0)
          };
          profiles.set(key, next);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, profile: next }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
        }
      });
      return;
    }
  }

  if (req.url.startsWith('/api/score')) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const name = String(data.name || '').trim();
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'name required' }));
          return;
        }
        const score = Number(data.score) || 0;
        const entry = {
          name,
          score,
          mode: data.mode || 'solo',
          roomCode: data.roomCode || null,
          time: Date.now()
        };
        const existing = globalScores.find((item) => item.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          if (score > existing.score) {
            existing.score = score;
            existing.mode = entry.mode;
            existing.roomCode = entry.roomCode;
            existing.time = entry.time;
          }
        } else {
          globalScores.push(entry);
        }
        globalScores.sort((a, b) => b.score - a.score);
        if (globalScores.length > 10) globalScores.length = 10;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/leaderboard')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, scores: globalScores }));
    return;
  }

  if (req.url.startsWith('/api/rooms/history')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = (url.searchParams.get('code') || '').toUpperCase();
    const history = code ? (roomHistory.get(code) || []) : roomHistoryGlobal;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, history }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_SETTINGS = {
  roundDuration: 60,
  winTarget: 2,
  maxPlayers: 6
};

function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function uniqueCode() {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  return code;
}

function sanitizeName(name) {
  const clean = String(name || '').trim().slice(0, 16);
  return clean || 'Player';
}

function sanitizeChat(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function sanitizeSettings(settings) {
  const payload = settings || {};
  const roundDuration = Math.min(180, Math.max(30, Number(payload.roundDuration) || DEFAULT_SETTINGS.roundDuration));
  const winTarget = Math.min(5, Math.max(1, Number(payload.winTarget) || DEFAULT_SETTINGS.winTarget));
  const maxPlayers = Math.min(8, Math.max(2, Number(payload.maxPlayers) || DEFAULT_SETTINGS.maxPlayers));
  return { roundDuration, winTarget, maxPlayers };
}

function roomState(room) {
  const players = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score
  }));
  return { code: room.code, hostId: room.hostId, players, settings: room.settings };
}

function broadcast(room, payload) {
  const data = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function addPlayer(room, ws, id, name) {
  const player = {
    id,
    name: sanitizeName(name),
    score: 0,
    ws
  };
  room.players.set(id, player);
  ws.roomCode = room.code;
  ws.playerId = id;
}

function removePlayer(room, id) {
  room.players.delete(id);
  if (room.hostId === id) {
    const next = room.players.values().next().value;
    room.hostId = next ? next.id : null;
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || !msg.type) return;

    if (msg.type === 'create') {
      const id = msg.id || `${Date.now()}-${Math.random()}`;
      let code = (msg.code || '').toString().toUpperCase();
      if (!code || rooms.has(code)) code = uniqueCode();

      const settings = sanitizeSettings(msg.settings);
      const room = { code, hostId: id, players: new Map(), settings };
      rooms.set(code, room);
      addPlayer(room, ws, id, msg.name);
      broadcast(room, { type: 'created', ...roomState(room) });
      return;
    }

    if (msg.type === 'join') {
      const id = msg.id || `${Date.now()}-${Math.random()}`;
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found.' });
        return;
      }
      if (!room.settings) {
        room.settings = { ...DEFAULT_SETTINGS };
      }
      if (room.players.size >= room.settings.maxPlayers) {
        send(ws, { type: 'error', message: 'Room is full.' });
        return;
      }
      addPlayer(room, ws, id, msg.name);
      broadcast(room, { type: 'state', ...roomState(room) });
      return;
    }

    if (msg.type === 'leave') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      removePlayer(room, msg.id);
      if (room.players.size === 0) {
        rooms.delete(code);
        return;
      }
      broadcast(room, { type: 'state', ...roomState(room) });
      return;
    }

    if (msg.type === 'score') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.get(msg.id);
      if (!player) return;
      player.score = Number(msg.score) || 0;
      broadcast(room, { type: 'score', id: player.id, score: player.score });
      return;
    }

    if (msg.type === 'roundStart' || msg.type === 'roundEnd') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      if (msg.id !== room.hostId) return;
      broadcast(room, msg);
      if (msg.type === 'roundEnd') {
        const winnerNames = (msg.winnerIds || []).map((id) => room.players.get(id)?.name || 'Player');
        const entry = {
          code,
          time: Date.now(),
          round: msg.round || 1,
          matchOver: !!msg.matchOver,
          winner: winnerNames.length ? winnerNames.join(', ') : 'No winner'
        };
        const list = roomHistory.get(code) || [];
        list.unshift(entry);
        if (list.length > 8) list.length = 8;
        roomHistory.set(code, list);
        roomHistoryGlobal.unshift(entry);
        if (roomHistoryGlobal.length > 20) roomHistoryGlobal.length = 20;
      }
      return;
    }

    if (msg.type === 'settings') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      if (msg.id !== room.hostId) return;
      room.settings = sanitizeSettings(msg.settings);
      broadcast(room, { type: 'state', ...roomState(room) });
      return;
    }

    if (msg.type === 'roundLose') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      if (!room.players.has(msg.id)) return;
      broadcast(room, msg);
      return;
    }

    if (msg.type === 'place') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.get(msg.id);
      if (!player) return;
      if (typeof msg.score === 'number') {
        player.score = msg.score;
      }
      broadcast(room, {
        type: 'place',
        id: player.id,
        name: player.name,
        score: player.score,
        perfect: !!msg.perfect,
        block: msg.block
      });
      return;
    }

    if (msg.type === 'chat') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.get(msg.id);
      if (!player) return;
      const text = sanitizeChat(msg.text);
      if (!text) return;
      broadcast(room, {
        type: 'chat',
        id: player.id,
        name: player.name,
        text,
        time: Date.now()
      });
      return;
    }

    if (msg.type === 'start') {
      const code = (msg.code || '').toString().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      if (msg.id !== room.hostId) return;
      broadcast(room, { type: 'start' });
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode || !ws.playerId) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    removePlayer(room, ws.playerId);
    if (room.players.size === 0) {
      rooms.delete(ws.roomCode);
      return;
    }
    broadcast(room, { type: 'state', ...roomState(room) });
  });
});

server.listen(PORT, () => {
  console.log(`Block Tower server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint on ws://localhost:${PORT}`);
});
