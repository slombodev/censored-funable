// Partida completa con 3 clientes reales contra el servidor: lobby → dibujo → revelación → votos → podio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let server;

before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => d.toString().includes('escuchando') && resolve());
    server.on('exit', reject);
  });
});
after(() => server.kill());

function client(pid) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { socket, pid, state: null, waiters: [] };
  socket.on('state', (s) => {
    c.state = s;
    c.waiters = c.waiters.filter(([pred, resolve]) => !(pred(s) && (resolve(s), true)));
  });
  c.call = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));
  c.until = (pred) => (c.state && pred(c.state) ? Promise.resolve(c.state) : new Promise((r) => c.waiters.push([pred, r])));
  return c;
}

test('flujo completo de una ronda', async () => {
  const [a, b, c] = ['player-aaaa', 'player-bbbb', 'player-cccc'].map(client);
  try {
    const created = await a.call('room:create', { name: 'Ana', pid: a.pid });
    assert.equal(created.ok, true);
    assert.match(created.code, /^[A-Z]{4}$/);

    assert.equal((await b.call('room:join', { code: created.code, name: 'Ana', pid: b.pid })).ok, true);
    assert.equal((await c.call('room:join', { code: created.code.toLowerCase(), name: 'Carla', pid: c.pid })).ok, true);
    const lobby = await a.until((s) => s.players.length === 3);
    assert.deepEqual(lobby.players.map((p) => p.name), ['Ana', 'Ana 2', 'Carla']);
    assert.equal(lobby.hostId, a.pid);

    // Solo el host configura y empieza.
    assert.equal((await b.call('game:start')).ok, false);
    assert.equal((await a.call('room:settings', { rounds: 1, drawTime: 60, categories: ['discord', 'nope'] })).ok, true);
    const configured = await a.until((s) => s.settings.rounds === 1);
    assert.deepEqual(configured.settings.categories, ['discord']);

    // Cualquiera añade invitados; solo quien lo añadió o el host lo quita.
    assert.equal((await b.call('guest:add', { name: '  Shakira ' })).ok, true);
    assert.equal((await c.call('guest:add', { name: 'shakira' })).ok, false);
    assert.equal((await c.call('guest:add', { name: 'carla' })).ok, false);
    const withGuest = await c.until((s) => s.guests.length === 1);
    assert.equal(withGuest.guests[0].name, 'Shakira');
    assert.equal((await c.call('guest:remove', { id: withGuest.guests[0].id })).ok, false);
    assert.equal((await a.call('guest:remove', { id: withGuest.guests[0].id })).ok, true);
    await b.call('guest:add', { name: 'Shakira' });
    await a.until((s) => s.guests.length === 1);
    assert.equal((await a.call('game:start')).ok, true);

    const drawing = await b.until((s) => s.phase === 'drawing');
    assert.equal(drawing.myEntry.category, 'discord');
    assert.ok(drawing.myEntry.parts.some((p) => p.type === 'blank'));
    assert.ok(drawing.myEntry.parts.some((p) => p.type === 'name'));

    assert.equal((await a.call('draw:submit', { image: 'data:text/html;base64,PHNjcmlwdD4=' })).ok, false);
    await a.call('draw:submit', { image: PIXEL });
    await b.call('draw:submit', { image: PIXEL });
    await c.call('draw:submit', { image: null }); // no entregó nada

    const reveal = await a.until((s) => s.phase === 'reveal');
    assert.equal(reveal.reveal.total, 3);
    assert.equal(reveal.reveal.entry.authorId, undefined, 'el autor no se filtra antes de revelar');
    assert.equal((await b.call('reveal:show')).ok, false);

    for (let i = 0; i < 3; i++) {
      await a.call('reveal:show');
      const shown = await a.until((s) => s.reveal?.revealed && s.reveal.index === i);
      if (shown.reveal.entry.img) {
        const res = await fetch(URL + shown.reveal.entry.img);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'image/png');
      }
      await a.call('reveal:next');
    }

    const voting = await c.until((s) => s.phase === 'voting');
    assert.equal(voting.entries.length, 2, 'solo se vota lo que tiene dibujo');
    const aEntry = voting.entries.find((e) => e.authorId === a.pid);
    const bEntry = voting.entries.find((e) => e.authorId === b.pid);

    assert.equal((await a.call('vote', { kind: 'funable', entryId: aEntry.id })).ok, false, 'no puedes votarte');
    await a.call('vote', { kind: 'funable', entryId: bEntry.id });
    await a.call('vote', { kind: 'meme', entryId: bEntry.id });
    await b.call('vote', { kind: 'funable', entryId: aEntry.id });
    await b.call('vote', { kind: 'meme', entryId: aEntry.id });
    await c.call('vote', { kind: 'funable', entryId: bEntry.id });
    await c.call('vote', { kind: 'meme', entryId: aEntry.id });

    const results = await a.until((s) => s.phase === 'results');
    assert.deepEqual(results.results.awards.funable, [bEntry.id]);
    assert.deepEqual(results.results.awards.meme, [aEntry.id]);
    const score = (id) => results.players.find((p) => p.id === id).score;
    assert.equal(score(a.pid), 300);
    assert.equal(score(b.pid), 300);
    assert.equal(score(c.pid), 0);

    await a.call('game:continue');
    await a.until((s) => s.phase === 'podium');
    await a.call('game:restart');
    const back = await a.until((s) => s.phase === 'lobby');
    assert.ok(back.players.every((p) => p.score === 0));
  } finally {
    [a, b, c].forEach((x) => x.socket.close());
  }
});

test('reconexión con el mismo pid conserva el jugador y el host pasa a otro', async () => {
  const a = client('player-host-1');
  const b = client('player-guest-1');
  try {
    const { code } = await a.call('room:create', { name: 'Host', pid: a.pid });
    await b.call('room:join', { code, name: 'Guest', pid: b.pid });
    await a.call('game:start');
    await b.until((s) => s.phase === 'drawing');

    a.socket.close();
    const afterLeave = await b.until((s) => s.hostId === b.pid);
    assert.equal(afterLeave.players.find((p) => p.id === a.pid).connected, false);

    const a2 = client('player-host-1');
    assert.equal((await a2.call('room:join', { code, name: 'Otro', pid: a2.pid })).ok, true);
    const rejoined = await a2.until((s) => s.players.find((p) => p.id === a2.pid)?.connected);
    assert.equal(rejoined.players.find((p) => p.id === a2.pid).name, 'Host');
    assert.ok(rejoined.myEntry, 'recupera su titular');
    a2.socket.close();
  } finally {
    a.socket.close();
    b.socket.close();
  }
});
