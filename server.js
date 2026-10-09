// Abba Letters — multiplayer game server (Node.js + WebSockets)
// Codenames-style rules, paintings instead of word cards.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public', 'manifest.json'), 'utf8')
);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // code -> room
let nextPlayerId = 1;

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(c) ? makeCode() : c;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newRoom(code) {
  return {
    code,
    players: new Map(), // playerId -> {id,name,team,clueGiver,ws}
    grid: [],           // [{day,file}]
    key: [],            // per grid index: 'gold'|'blue'|'neutral'|'deceiver'
    revealed: [],       // per grid index: null | team
    turn: 'gold',
    firstTeam: 'gold',
    clue: null,         // {text,count,guessesLeft,by}
    winner: null,
    started: false,
  };
}

function dealRound(room) {
  const deck = shuffle([...MANIFEST]).slice(0, 25);
  const order = shuffle([...Array(25).keys()]);
  const key = new Array(25).fill('neutral');
  const first = room.firstTeam;
  const second = first === 'gold' ? 'blue' : 'gold';
  order.slice(0, 9).forEach(i => (key[i] = first));
  order.slice(9, 17).forEach(i => (key[i] = second));
  key[order[17]] = 'deceiver';
  room.grid = deck;
  room.key = key;
  room.revealed = new Array(25).fill(null);
  room.turn = first;
  room.clue = null;
  room.winner = null;
  room.started = true;
  room.firstTeam = second; // alternate starter next round
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, team: p.team, clueGiver: p.clueGiver,
  }));
}

// State each player is allowed to see. Clue-givers see the key.
function stateFor(room, player) {
  const s = {
    t: 'state',
    code: room.code,
    players: publicPlayers(room),
    grid: room.grid,
    revealed: room.revealed,
    turn: room.turn,
    clue: room.clue,
    winner: room.winner,
    started: room.started,
    you: { id: player.id, name: player.name, team: player.team, clueGiver: player.clueGiver },
  };
  if (player.clueGiver) s.key = room.key;
  return s;
}

function broadcast(room) {
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(stateFor(room, p)));
  }
}

function remaining(room, team) {
  let n = 0;
  room.key.forEach((k, i) => {
    if (k === team && !room.revealed[i]) n++;
  });
  return n;
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', ws => {
  let room = null;
  let player = null;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create') {
      const code = makeCode();
      room = newRoom(code);
      rooms.set(code, room);
      player = { id: nextPlayerId++, name: String(m.name || 'Player').slice(0, 24), team: null, clueGiver: false, ws };
      room.players.set(player.id, player);
      broadcast(room);
      return;
    }

    if (m.t === 'join') {
      room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) return send(ws, { t: 'error', msg: 'Room not found. Check the code.' });
      player = { id: nextPlayerId++, name: String(m.name || 'Player').slice(0, 24), team: null, clueGiver: false, ws };
      room.players.set(player.id, player);
      broadcast(room);
      return;
    }

    if (!room || !player) return;

    if (m.t === 'team') {
      if (!room.started && (m.team === 'gold' || m.team === 'blue')) player.team = m.team;
      broadcast(room);
      return;
    }

    if (m.t === 'role') {
      if (!room.started) player.clueGiver = !!m.clueGiver;
      broadcast(room);
      return;
    }

    if (m.t === 'start') {
      if (room.started) return;
      const gold = [...room.players.values()].filter(p => p.team === 'gold');
      const blue = [...room.players.values()].filter(p => p.team === 'blue');
      const ok = t => t.some(p => p.clueGiver) && t.some(p => !p.clueGiver);
      if (!ok(gold) || !ok(blue)) {
        return send(ws, { t: 'error', msg: 'Each team needs a Storyteller and at least one Guesser.' });
      }
      dealRound(room);
      broadcast(room);
      return;
    }

    if (m.t === 'clue') {
      if (!room.started || room.winner || room.clue) return;
      if (!player.clueGiver || player.team !== room.turn) return;
      const text = String(m.text || '').trim().slice(0, 60);
      const count = Math.max(0, Math.min(9, parseInt(m.count, 10) || 0));
      if (!text) return send(ws, { t: 'error', msg: 'Give a clue phrase first.' });
      room.clue = { text, count, guessesLeft: count + 1, by: player.name };
      broadcast(room);
      return;
    }

    if (m.t === 'guess') {
      if (!room.started || room.winner || !room.clue) return;
      if (player.clueGiver || player.team !== room.turn) return;
      const i = parseInt(m.index, 10);
      if (!(i >= 0 && i < 25) || room.revealed[i]) return;
      const hit = room.key[i];
      const me = room.turn;
      const other = me === 'gold' ? 'blue' : 'gold';
      room.revealed[i] = hit === 'neutral' ? 'neutral' : hit;

      if (hit === 'deceiver') {
        room.winner = other;
      } else if (hit === me) {
        room.clue.guessesLeft--;
        if (remaining(room, me) === 0) room.winner = me;
        else if (room.clue.guessesLeft <= 0) { room.turn = other; room.clue = null; }
      } else if (hit === other) {
        if (remaining(room, other) === 0) room.winner = other;
        room.turn = other; room.clue = null;
      } else {
        room.turn = other; room.clue = null; // wanderer
      }
      broadcast(room);
      return;
    }

    if (m.t === 'pass') {
      if (!room.started || room.winner || !room.clue) return;
      if (player.clueGiver || player.team !== room.turn) return;
      room.turn = room.turn === 'gold' ? 'blue' : 'gold';
      room.clue = null;
      broadcast(room);
      return;
    }

    if (m.t === 'newRound') {
      if (!room.started || !room.winner) return;
      dealRound(room);
      broadcast(room);
      return;
    }
  });

  ws.on('close', () => {
    if (room && player) {
      room.players.delete(player.id);
      if (room.players.size === 0) rooms.delete(room.code);
      else broadcast(room);
    }
  });
});

server.listen(PORT, () => console.log(`Abba Letters game on http://localhost:${PORT}`));
