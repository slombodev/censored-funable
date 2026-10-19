import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { CATEGORIES, generateHeadline, shuffle } from './headlines.js';

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 12;
const MIN_PLAYERS = 2;
const DRAW_TIMES = [60, 90, 120, 180, 240, 300];
const MAX_GUESTS = 30;
const VOTE_SECONDS = 45;
const COLLECT_GRACE_MS = 3000; // margen para que lleguen los dibujos al acabar el tiempo
const EMPTY_ROOM_TTL_MS = 10 * 60_000;
const MAX_IMAGE_BYTES = 1_500_000;
const REACT_COOLDOWN_MS = 120;
const POINTS_PER_VOTE = 100;
const REACTIONS = ['😂', '💀', '🚨', '🤡', '💩'];
const VOTE_KINDS = ['funable', 'meme'];
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PLAYER_COLORS = [
  '#c8ff2e', '#ff2d87', '#2de2ff', '#ffb800', '#a66bff', '#ff6b2d',
  '#3dffa8', '#ff5c5c', '#5c8bff', '#ff4fd8', '#00e0c6', '#ffe14d',
];
const CATEGORY_META = Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, emoji: c.emoji }));

const app = express();
const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
const rooms = new Map();

app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
app.get('/healthz', (_req, res) => res.send('ok'));
// Los dibujos se sirven por HTTP (cacheables) en vez de reenviarse por socket en cada cambio de estado.
app.get('/img/:code/:imgId', (req, res) => {
  const entry = rooms.get(req.params.code)?.entries.find((e) => e.imgId === req.params.imgId);
  if (!entry?.img) return res.sendStatus(404);
  res.type(entry.img.mime).set('Cache-Control', 'private, max-age=3600').send(entry.img.data);
});

// ---------- Sala ----------

function createRoom() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
  } while (rooms.has(code));
  const room = {
    code,
    hostId: null,
    phase: 'lobby',
    round: 0,
    settings: { rounds: 3, drawTime: 120, categories: Object.keys(CATEGORIES) },
    players: new Map(),
    // Personas que no juegan pero salen en los titulares; cualquiera las añade en la lobby.
    guests: [],
    entries: [],
    usedTemplates: new Set(),
    timer: null,
    collecting: false,
    reveal: null,
    votes: new Map(),
    results: null,
    expiry: null,
  };
  rooms.set(code, room);
  return room;
}

const connectedPlayers = (room) => [...room.players.values()].filter((p) => p.connected);

const trimName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);

function cleanName(raw, room, pid) {
  const base = trimName(raw);
  if (!base) return null;
  const taken = new Set([...room.players.values()].filter((p) => p.id !== pid).map((p) => p.name.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 13)} ${n}`;
  return name;
}

function nextColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
}

function startTimer(room, ms, onEnd) {
  clearTimer(room);
  room.timer = { endsAt: Date.now() + ms, total: ms, handle: setTimeout(onEnd, ms) };
}

function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer.handle);
  room.timer = null;
}

// ---------- Fases ----------

function resetToLobby(room) {
  clearTimer(room);
  Object.assign(room, { phase: 'lobby', round: 0, entries: [], reveal: null, results: null, collecting: false });
  room.votes.clear();
  room.usedTemplates.clear();
  for (const p of room.players.values()) p.score = 0;
}

function startRound(room) {
  room.round += 1;
  room.phase = 'drawing';
  room.collecting = false;
  room.reveal = null;
  room.results = null;
  room.votes.clear();
  const players = connectedPlayers(room);
  const names = players.map((p) => p.name);
  // Un jugador que entró con el mismo nombre que un invitado no debe salir dos veces en un titular.
  const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
  const guests = room.guests.map((g) => g.name).filter((n) => !taken.has(n.toLowerCase()));
  room.entries = players.map((p) => ({
    id: randomUUID(),
    authorId: p.id,
    ...generateHeadline(room.settings.categories, names, room.usedTemplates, guests),
    submitted: false,
    img: null,
    imgId: null,
    reactions: {},
  }));
  startTimer(room, room.settings.drawTime * 1000, () => collectDrawings(room));
}

function collectDrawings(room) {
  room.collecting = true;
  io.to(room.code).emit('draw:collect');
  startTimer(room, COLLECT_GRACE_MS, () => {
    startReveal(room);
    broadcast(room);
  });
  broadcast(room);
}

function startReveal(room) {
  clearTimer(room);
  room.phase = 'reveal';
  room.collecting = false;
  room.entries = shuffle(room.entries);
  room.reveal = { index: 0, revealed: false };
}

const votingCandidates = (room, pid) => room.entries.filter((e) => e.img && e.authorId !== pid);

function startVoting(room) {
  room.phase = 'voting';
  room.votes.clear();
  if (!room.entries.some((e) => e.img)) return finishVoting(room);
  startTimer(room, VOTE_SECONDS * 1000, () => {
    finishVoting(room);
    broadcast(room);
  });
}

function finishVoting(room) {
  clearTimer(room);
  const tally = Object.fromEntries(room.entries.map((e) => [e.id, { funable: 0, meme: 0 }]));
  for (const ballot of room.votes.values()) {
    for (const kind of VOTE_KINDS) if (ballot[kind]) tally[ballot[kind]][kind] += 1;
  }
  const deltas = {};
  for (const e of room.entries) {
    const points = (tally[e.id].funable + tally[e.id].meme) * POINTS_PER_VOTE;
    const author = room.players.get(e.authorId);
    if (author && points) author.score += points;
    deltas[e.authorId] = (deltas[e.authorId] ?? 0) + points;
  }
  const awards = {};
  for (const kind of VOTE_KINDS) {
    const best = Math.max(0, ...room.entries.map((e) => tally[e.id][kind]));
    awards[kind] = best > 0 ? room.entries.filter((e) => tally[e.id][kind] === best).map((e) => e.id) : [];
  }
  room.results = { tally, deltas, awards };
  room.phase = 'results';
}

function hasFinishedVoting(room, pid) {
  const ballot = room.votes.get(pid) ?? {};
  return votingCandidates(room, pid).length === 0 || VOTE_KINDS.every((k) => ballot[k]);
}

function isDone(room, pid) {
  if (room.phase === 'drawing') return !!room.entries.find((e) => e.authorId === pid)?.submitted;
  if (room.phase === 'voting') return hasFinishedVoting(room, pid);
  return false;
}

// Avanza la fase en cuanto todos los conectados han terminado (también tras una desconexión).
function checkProgress(room) {
  const online = connectedPlayers(room);
  if (room.phase === 'drawing') {
    const pending = room.entries.filter((e) => !e.submitted && room.players.get(e.authorId)?.connected);
    if (!pending.length) startReveal(room);
  } else if (room.phase === 'voting') {
    if (online.every((p) => hasFinishedVoting(room, p.id))) finishVoting(room);
  }
}

// ---------- Estado visible por cada jugador ----------

function publicEntry(room, e) {
  return {
    id: e.id,
    parts: e.parts,
    category: e.category,
    authorId: e.authorId,
    img: e.img ? `/img/${room.code}/${e.imgId}` : null,
    reactions: e.reactions,
  };
}

function snapshot(room, pid) {
  const s = {
    code: room.code,
    phase: room.phase,
    round: room.round,
    hostId: room.hostId,
    me: pid,
    settings: room.settings,
    categories: CATEGORY_META,
    drawTimes: DRAW_TIMES,
    guests: room.guests,
    collecting: room.collecting,
    timer: room.timer ? { remaining: Math.max(0, room.timer.endsAt - Date.now()), total: room.timer.total } : null,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      connected: p.connected,
      done: isDone(room, p.id),
    })),
  };
  if (room.phase === 'drawing') {
    const mine = room.entries.find((e) => e.authorId === pid);
    s.myEntry = mine ? { parts: mine.parts, category: mine.category, submitted: mine.submitted } : null;
    s.drawingIds = room.entries.map((e) => e.authorId);
  } else if (room.phase === 'reveal') {
    const e = room.entries[room.reveal.index];
    s.reveal = {
      index: room.reveal.index,
      total: room.entries.length,
      revealed: room.reveal.revealed,
      // Hasta que se revela no se filtra ni autor ni imagen.
      entry: room.reveal.revealed ? publicEntry(room, e) : { id: e.id, parts: e.parts, category: e.category },
    };
  } else if (room.phase === 'voting') {
    s.entries = room.entries.filter((e) => e.img).map((e) => publicEntry(room, e));
    s.myVotes = room.votes.get(pid) ?? {};
  } else if (room.phase === 'results') {
    s.entries = room.entries.map((e) => publicEntry(room, e));
    s.results = room.results;
  }
  return s;
}

function broadcast(room) {
  for (const p of room.players.values()) {
    if (p.connected) io.to(p.socketId).emit('state', snapshot(room, p.id));
  }
}

// ---------- Sockets ----------

const validPid = (pid) => typeof pid === 'string' && /^[\w-]{8,64}$/.test(pid);

io.on('connection', (socket) => {
  const current = () => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.pid);
    return player && player.socketId === socket.id ? { room, player } : {};
  };

  const on = (event, handler, { hostOnly = false } = {}) => {
    socket.on(event, (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : () => {};
      const { room, player } = current();
      if (!room) return reply({ ok: false, error: 'No estás en ninguna sala.' });
      if (hostOnly && room.hostId !== player.id) return reply({ ok: false, error: 'Solo el host puede hacer eso.' });
      handler(room, player, payload ?? {}, reply);
    });
  };

  function join(room, { pid, name }, reply) {
    if (!validPid(pid)) return reply({ ok: false, error: 'Identificador inválido.' });
    if (socket.data.code && (socket.data.code !== room.code || socket.data.pid !== pid)) leaveCurrent();
    let player = room.players.get(pid);
    if (!player) {
      if (room.players.size >= MAX_PLAYERS) return reply({ ok: false, error: 'La sala está llena (máx. 12).' });
      const clean = cleanName(name, room, pid);
      if (!clean) return reply({ ok: false, error: 'Necesitas un apodo.' });
      player = { id: pid, name: clean, color: nextColor(room), score: 0, connected: false, socketId: null };
      room.players.set(pid, player);
    }
    const previousSocket = player.connected ? player.socketId : null;
    player.socketId = socket.id;
    player.connected = true;
    // Mismo jugador abierto en otra pestaña: la vieja queda fuera.
    if (previousSocket && previousSocket !== socket.id) io.sockets.sockets.get(previousSocket)?.disconnect(true);
    socket.data = { code: room.code, pid };
    socket.join(room.code);
    clearTimeout(room.expiry);
    if (!room.players.get(room.hostId)?.connected) room.hostId = pid;
    reply({ ok: true, code: room.code });
    broadcast(room);
  }

  function leaveCurrent() {
    const { room, player } = current();
    if (!room) return;
    socket.leave(room.code);
    player.connected = false;
    if (room.phase === 'lobby') room.players.delete(player.id);
    if (room.hostId === player.id) room.hostId = connectedPlayers(room)[0]?.id ?? null;
    if (!connectedPlayers(room).length) {
      clearTimer(room);
      room.expiry = setTimeout(() => rooms.delete(room.code), EMPTY_ROOM_TTL_MS);
      return;
    }
    checkProgress(room);
    broadcast(room);
  }

  socket.on('room:create', (payload = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!validPid(payload.pid) || !cleanName(payload.name, { players: new Map() })) {
      return reply({ ok: false, error: 'Necesitas un apodo.' });
    }
    const room = createRoom();
    join(room, payload, reply);
  });

  socket.on('room:join', (payload = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const room = rooms.get(String(payload.code ?? '').toUpperCase());
    if (!room) return reply({ ok: false, error: 'Esa sala no existe (o ya cerró).' });
    join(room, payload, reply);
  });

  on('room:settings', (room, _p, input, reply) => {
    if (room.phase !== 'lobby') return reply({ ok: false });
    const rounds = Number(input.rounds);
    const drawTime = Number(input.drawTime);
    const categories = Array.isArray(input.categories) ? input.categories.filter((k) => k in CATEGORIES) : [];
    if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 10) room.settings.rounds = rounds;
    if (DRAW_TIMES.includes(drawTime)) room.settings.drawTime = drawTime;
    if (categories.length) room.settings.categories = [...new Set(categories)];
    reply({ ok: true });
    broadcast(room);
  }, { hostOnly: true });

  on('guest:add', (room, player, { name }, reply) => {
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Solo se pueden añadir en la lobby.' });
    const clean = trimName(name);
    if (!clean) return reply({ ok: false, error: 'Escribe un nombre.' });
    if (room.guests.length >= MAX_GUESTS) return reply({ ok: false, error: `Máximo ${MAX_GUESTS} invitados.` });
    const lower = clean.toLowerCase();
    const exists = room.guests.some((g) => g.name.toLowerCase() === lower)
      || [...room.players.values()].some((p) => p.name.toLowerCase() === lower);
    if (exists) return reply({ ok: false, error: 'Ese nombre ya está en la sala.' });
    room.guests.push({ id: randomUUID(), name: clean, addedBy: player.id });
    reply({ ok: true });
    broadcast(room);
  });

  // Lo quita quien lo añadió o el host.
  on('guest:remove', (room, player, { id }, reply) => {
    const guest = room.guests.find((g) => g.id === id);
    if (room.phase !== 'lobby' || !guest) return reply({ ok: false });
    if (guest.addedBy !== player.id && room.hostId !== player.id) return reply({ ok: false, error: 'Solo quien lo añadió o el host puede quitarlo.' });
    room.guests = room.guests.filter((g) => g !== guest);
    reply({ ok: true });
    broadcast(room);
  });

  on('game:start', (room, _p, _in, reply) => {
    if (room.phase !== 'lobby') return reply({ ok: false });
    if (connectedPlayers(room).length < MIN_PLAYERS) return reply({ ok: false, error: `Hacen falta al menos ${MIN_PLAYERS} jugadores.` });
    resetToLobby(room);
    startRound(room);
    reply({ ok: true });
    broadcast(room);
  }, { hostOnly: true });

  on('draw:submit', (room, player, { image }, reply) => {
    const entry = room.entries.find((e) => e.authorId === player.id);
    if (room.phase !== 'drawing' || !entry) return reply({ ok: false, error: 'Ya no se aceptan dibujos.' });
    if (entry.submitted) return reply({ ok: true });
    if (image != null) {
      const match = typeof image === 'string' && image.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return reply({ ok: false, error: 'Imagen inválida.' });
      const data = Buffer.from(match[2], 'base64');
      if (data.length > MAX_IMAGE_BYTES) return reply({ ok: false, error: 'El dibujo pesa demasiado.' });
      entry.img = { mime: match[1], data };
      entry.imgId = randomUUID();
    }
    entry.submitted = true;
    reply({ ok: true });
    checkProgress(room);
    broadcast(room);
  });

  on('reveal:show', (room, _p, _in, reply) => {
    if (room.phase !== 'reveal' || room.reveal.revealed) return reply({ ok: false });
    room.reveal.revealed = true;
    reply({ ok: true });
    broadcast(room);
  }, { hostOnly: true });

  on('reveal:next', (room, _p, _in, reply) => {
    if (room.phase !== 'reveal' || !room.reveal.revealed) return reply({ ok: false });
    if (room.reveal.index < room.entries.length - 1) {
      room.reveal = { index: room.reveal.index + 1, revealed: false };
    } else {
      startVoting(room);
    }
    reply({ ok: true });
    broadcast(room);
  }, { hostOnly: true });

  on('vote', (room, player, { kind, entryId }, reply) => {
    if (room.phase !== 'voting' || !VOTE_KINDS.includes(kind)) return reply({ ok: false });
    if (!votingCandidates(room, player.id).some((e) => e.id === entryId)) {
      return reply({ ok: false, error: 'No puedes votar eso.' });
    }
    room.votes.set(player.id, { ...room.votes.get(player.id), [kind]: entryId });
    reply({ ok: true });
    checkProgress(room);
    broadcast(room);
  });

  on('game:continue', (room, _p, _in, reply) => {
    if (room.phase !== 'results') return reply({ ok: false });
    if (room.round < room.settings.rounds) startRound(room);
    else room.phase = 'podium';
    reply({ ok: true });
    broadcast(room);
  }, { hostOnly: true });

  on('game:restart', (room, _p, _in, reply) => {
    if (room.phase !== 'podium') return reply({ ok: false });
    resetToLobby(room);
    reply({ ok: true });
    broadcast(room);
  }, { hostOnly: true });

  on('react', (room, player, { emoji }) => {
    if (!REACTIONS.includes(emoji) || !['reveal', 'results'].includes(room.phase)) return;
    const now = Date.now();
    if (now - (socket.data.lastReact ?? 0) < REACT_COOLDOWN_MS) return;
    socket.data.lastReact = now;
    if (room.phase === 'reveal' && room.reveal.revealed) {
      const entry = room.entries[room.reveal.index];
      entry.reactions[emoji] = (entry.reactions[emoji] ?? 0) + 1;
    }
    io.to(room.code).emit('react', { emoji, color: player.color });
  });

  socket.on('disconnect', leaveCurrent);
});

server.listen(PORT, () => {
  console.log(`CENSORED! escuchando en http://localhost:${PORT}`);
});
