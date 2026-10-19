import { sfx, unlockAudio, toggleMute, isMuted } from './audio.js';
import { Board, MIN_SIZE, MAX_SIZE } from './board.js';
import { flyEmoji, confetti, flash, shake } from './fx.js';

const REACTIONS = ['😂', '💀', '🚨', '🤡', '💩'];
const INK = [
  '#111111', '#ffffff', '#8a8a8a', '#f2c09b', '#c68642', '#8b5a2b', '#ff2d55', '#b3001b', '#ff8a00', '#ffd600',
  '#fff38a', '#2bd96b', '#0f7a3c', '#14b8ff', '#1f3bff', '#7c4dff', '#ff4fd8', '#ffb3d9',
];
const SCREEN_BY_PHASE = { lobby: 'lobby', drawing: 'draw', reveal: 'reveal', voting: 'vote', results: 'results', podium: 'podium' };
const DRAMA_MS = 1150;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const storage = (area) => ({
  get: (k) => { try { return area.getItem(k); } catch { return null; } },
  set: (k, v) => { try { area.setItem(k, v); } catch {} },
  del: (k) => { try { area.removeItem(k); } catch {} },
});
const local = storage(window.localStorage);
const session = storage(window.sessionStorage);

const pid = local.get('censored.pid') ?? (() => {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  local.set('censored.pid', id);
  return id;
})();

const socket = io();
const board = new Board($('#board'), $('#text-input'));

let S = null; // último estado del servidor
let screen = null;
const ui = {
  timerEnds: 0,
  timerTotal: 0,
  lastSecond: null,
  alarmKey: null,
  submitted: false,
  drawKey: null,
  revealKey: null,
  revealPlayed: false,
  voteKey: null,
  resultsKey: null,
  podiumKey: null,
  knownPlayers: new Set(),
};

// ---------- utilidades ----------

const me = () => S.players.find((p) => p.id === S.me);
const isHost = () => S.hostId === S.me;
const player = (id) => S.players.find((p) => p.id === id);
const category = (key) => S.categories.find((c) => c.key === key) ?? { emoji: '📰', label: 'Noticia' };
const initial = (name) => [...name.trim()][0]?.toUpperCase() ?? '?';

let toastTimer;
function toast(message, tone = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  if (tone === 'error') sfx.error();
}

function emit(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => {
      if (res && !res.ok && res.error) toast(res.error, 'error');
      resolve(res ?? { ok: false });
    });
  });
}

function avatar(p) {
  return `<span class="avatar" style="--c:${p.color}">${esc(initial(p.name))}</span>`;
}

function headlineHTML(parts, mode = 'censored') {
  return parts.map((part) => {
    if (part.type === 'text') return esc(part.value);
    if (part.type === 'name') return `<mark class="hl-name">${esc(part.value)}</mark>`;
    const label = { censored: 'CENSURADO', declassified: 'DESCLASIFICADO ↓', mini: '' }[mode];
    return `<span class="redact redact-${mode}"><span>${label}</span></span>`;
  }).join('');
}

function clipping(entry, mode) {
  const cat = category(entry.category);
  return `
    <article class="clipping">
      <header class="clip-mast">
        <span class="clip-paper">EL NOTICIERO</span>
        <span class="clip-cat">${cat.emoji} ${esc(cat.label)}</span>
      </header>
      <h2 class="clip-headline">${headlineHTML(entry.parts, mode)}</h2>
    </article>`;
}

function statusStrip(el, ids, verb) {
  el.innerHTML = ids.map(player).filter(Boolean).map((p) => `
    <li class="status ${p.done ? 'done' : ''} ${p.connected ? '' : 'offline'}" style="--c:${p.color}" title="${esc(p.name)} ${p.done ? verb : '…'}">
      ${avatar(p)}<span>${esc(p.name)}</span>
    </li>`).join('');
}

// ---------- render ----------

function render() {
  const next = S ? SCREEN_BY_PHASE[S.phase] : 'home';
  if (next !== screen) {
    screen = next;
    for (const el of document.querySelectorAll('.screen')) {
      el.hidden = el.dataset.screen !== next;
      el.classList.toggle('enter', !el.hidden);
    }
    window.scrollTo({ top: 0 });
  }
  $('#topbar').hidden = !S;
  document.body.dataset.screen = next;
  if (!S) return;
  $('#topbar-code').textContent = S.code;
  ({ lobby: renderLobby, draw: renderDraw, reveal: renderReveal, vote: renderVote, results: renderResults, podium: renderPodium })[next]();
}

function renderLobby() {
  const host = isHost();
  const online = S.players.filter((p) => p.connected);
  $('#lobby-code').textContent = S.code;
  $('#player-count').textContent = `${online.length}/12`;

  $('#player-list').innerHTML = S.players.map((p) => {
    const fresh = !ui.knownPlayers.has(p.id);
    ui.knownPlayers.add(p.id);
    return `
      <li class="player ${fresh ? 'fresh' : ''} ${p.connected ? '' : 'offline'}" style="--c:${p.color}">
        ${avatar(p)}
        <span class="pname">${esc(p.name)}</span>
        ${p.id === S.hostId ? '<span class="tag tag-host">Host</span>' : ''}
        ${p.id === S.me ? '<span class="tag">Tú</span>' : ''}
      </li>`;
  }).join('');

  const { rounds, drawTime, categories } = S.settings;
  const dis = host ? '' : 'disabled';
  $('#settings-note').textContent = host ? '' : 'Solo el host';
  $('#settings').innerHTML = `
    <div class="setting">
      <span class="setting-label">Rondas</span>
      <div class="seg" data-setting="rounds">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-value="${n}" aria-pressed="${n === rounds}" ${dis}>${n}</button>`).join('')}
      </div>
    </div>
    <div class="setting">
      <span class="setting-label">Tiempo para dibujar</span>
      <div class="seg" data-setting="drawTime">
        ${[60, 90, 120].map((n) => `<button type="button" data-value="${n}" aria-pressed="${n === drawTime}" ${dis}>${n}s</button>`).join('')}
      </div>
    </div>
    <div class="setting">
      <span class="setting-label">Categorías de titulares</span>
      <div class="chips" data-setting="categories">
        ${S.categories.map((c) => `<button type="button" class="chip" data-value="${c.key}" aria-pressed="${categories.includes(c.key)}" ${dis}><span>${c.emoji}</span>${esc(c.label)}</button>`).join('')}
      </div>
    </div>`;

  const hostName = player(S.hostId)?.name ?? 'el host';
  $('#lobby-cta').innerHTML = host
    ? online.length < 2
      ? `<button class="btn btn-lime btn-xl" type="button" disabled>Hace falta otro acusado</button><p class="hint">Pasa el enlace por Discord. Mínimo 2 jugadores.</p>`
      : `<button class="btn btn-lime btn-xl" type="button" data-action="start">Empezar el juicio</button>`
    : `<p class="waiting"><span class="dots"><i></i><i></i><i></i></span>Esperando a que <b>${esc(hostName)}</b> empiece el juicio</p>`;
}

function renderDraw() {
  const key = `${S.code}:${S.round}`;
  if (ui.drawKey !== key) {
    ui.drawKey = key;
    ui.submitted = false;
    board.reset();
    $('#draw-headline').innerHTML = S.myEntry
      ? clipping(S.myEntry, 'censored')
      : `<article class="clipping"><h2 class="clip-headline">Llegaste a mitad de ronda. Esta te toca mirar; en la siguiente, a sufrir.</h2></article>`;
  }
  if (S.myEntry?.submitted) ui.submitted = true;
  const locked = ui.submitted || !S.myEntry;
  board.setLocked(locked);
  const lock = $('#stage-lock');
  lock.hidden = !locked;
  lock.innerHTML = !S.myEntry
    ? '<b>Modo espectador</b>'
    : S.collecting
      ? '<b>¡Tiempo!</b><span>Recogiendo pruebas…</span>'
      : '<b>Prueba entregada</b><span>Esperando al resto de sospechosos</span>';
  $('#submit-drawing').disabled = locked;
  $('#submit-drawing').textContent = ui.submitted ? 'Entregado ✓' : 'Entregar prueba';
  statusStrip($('#draw-status'), S.drawingIds, 'ya entregó');
}

function renderReveal() {
  const r = S.reveal;
  const key = `${S.code}:${S.round}:${r.index}`;
  const host = isHost();
  if (ui.revealKey !== key) {
    ui.revealKey = key;
    ui.revealPlayed = r.revealed;
    $('#reveal-count').textContent = `Ronda ${S.round}/${S.settings.rounds} · Caso ${r.index + 1} de ${r.total}`;
    $('#reveal-clip').innerHTML = clipping(r.entry, r.revealed ? 'declassified' : 'censored');
    $('#evidence').className = `evidence ${r.revealed ? 'open' : ''}`;
    $('#evidence').innerHTML = `
      <div class="evidence-inner">${r.revealed ? evidenceHTML(r.entry) : ''}</div>
      <div class="cover" aria-hidden="true">
        <div class="cover-half l"><div class="cover-face"><b>CENSURADO</b></div></div>
        <div class="cover-half r"><div class="cover-face"><b>CENSURADO</b></div></div>
      </div>`;
    $('#reveal-byline').innerHTML = r.revealed ? bylineHTML(r.entry) : '';
    $('#reveal-byline').classList.toggle('show', r.revealed);
  }
  if (r.revealed && !ui.revealPlayed) {
    ui.revealPlayed = true;
    dramatize(key, r.entry);
  }

  const last = r.index === r.total - 1;
  $('#reveal-controls').innerHTML = host
    ? r.revealed
      ? `<button class="btn btn-ghost btn-xl" type="button" data-action="reveal-next">${last ? 'Pasar al veredicto 🗳️' : 'Siguiente caso →'}</button>`
      : `<button class="btn btn-pink btn-xl" type="button" data-action="reveal-show">💥 Quitar la censura</button>`
    : `<p class="waiting">${r.revealed ? 'Reaccionad sin miedo. El host pasa al siguiente caso.' : `<span class="dots"><i></i><i></i><i></i></span><b>${esc(player(S.hostId)?.name ?? 'El host')}</b> tiene el dedo sobre el botón…`}</p>`;
  $('#reactions').classList.toggle('live', r.revealed);
}

function evidenceHTML(entry) {
  const author = player(entry.authorId);
  return entry.img
    ? `<img src="${entry.img}" alt="Dibujo de ${esc(author?.name ?? 'un jugador')}" draggable="false">`
    : `<div class="no-evidence"><b>🐔</b><p>El acusado no entregó pruebas.</p><span>Cobardía documentada.</span></div>`;
}

function bylineHTML(entry) {
  const author = player(entry.authorId);
  return author ? `Prueba aportada por ${avatar(author)} <b style="color:${author.color}">${esc(author.name)}</b>` : 'Autor desaparecido en combate';
}

// Todos los clientes reciben el mismo cambio de estado y montan el mismo show: redoble → la censura revienta.
function dramatize(key, entry) {
  const ev = $('#evidence');
  ev.querySelector('.evidence-inner').innerHTML = evidenceHTML(entry); // precarga durante el redoble
  ev.classList.add('armed');
  sfx.drumroll(DRAMA_MS / 1000);
  setTimeout(() => {
    if (ui.revealKey !== key) return;
    ev.classList.remove('armed');
    ev.classList.add('broken');
    sfx.shatter();
    flash();
    shake($('#reveal-stage'), 14);
    $('#reveal-clip').innerHTML = clipping(entry, 'declassified');
    $('#reveal-byline').innerHTML = bylineHTML(entry);
    $('#reveal-byline').classList.add('show');
    setTimeout(() => ui.revealKey === key && ev.classList.add('open'), 1300);
  }, DRAMA_MS);
}

function renderVote() {
  const key = `${S.code}:${S.round}`;
  if (ui.voteKey !== key) {
    ui.voteKey = key;
    $('#vote-grid').innerHTML = S.entries.map((e) => {
      const mine = e.authorId === S.me;
      return `
        <article class="vote-card ${mine ? 'mine' : ''}" data-id="${e.id}">
          <div class="vote-img"><img src="${e.img}" alt="" loading="lazy" draggable="false"></div>
          <p class="vote-headline">${headlineHTML(e.parts, 'mini')}</p>
          ${mine
            ? '<p class="mine-tag">Tu obra · no te puedes votar</p>'
            : `<div class="vote-btns">
                 <button class="vote-btn" type="button" data-kind="funable" data-id="${e.id}">🔥 Funable</button>
                 <button class="vote-btn" type="button" data-kind="meme" data-id="${e.id}">🏆 Meme</button>
               </div>`}
        </article>`;
    }).join('');
  }
  for (const btn of document.querySelectorAll('.vote-btn')) {
    btn.setAttribute('aria-pressed', String(S.myVotes[btn.dataset.kind] === btn.dataset.id));
  }
  statusStrip($('#vote-status'), S.players.filter((p) => p.connected).map((p) => p.id), 'ya votó');
}

function renderResults() {
  const key = `${S.code}:${S.round}`;
  const { awards, tally, deltas } = S.results;
  if (ui.resultsKey !== key) {
    ui.resultsKey = key;
    $('#results-title').textContent = `Veredicto · Ronda ${S.round} de ${S.settings.rounds}`;
    const byId = Object.fromEntries(S.entries.map((e) => [e.id, e]));
    const award = (kind, title, accent) => {
      const winners = awards[kind].map((id) => byId[id]);
      if (!winners.length) {
        return `<section class="award" style="--accent:${accent}"><h3>${title}</h3><p class="award-empty">Desierto. Nadie votó. Cobardes.</p></section>`;
      }
      return `
        <section class="award" style="--accent:${accent}">
          <h3>${title}${winners.length > 1 ? ' <small>empate</small>' : ''}</h3>
          ${winners.map((e) => {
            const author = player(e.authorId);
            const reactions = Object.entries(e.reactions).sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([emoji, n]) => `<span>${emoji} ${n}</span>`).join('');
            return `
              <figure class="award-entry">
                <img src="${e.img}" alt="" draggable="false">
                <figcaption>
                  <p class="award-headline">${headlineHTML(e.parts, 'mini')}</p>
                  <p class="award-author">${author ? avatar(author) : ''}<b>${esc(author?.name ?? '¿?')}</b><span class="votes">${tally[e.id][kind]} voto${tally[e.id][kind] === 1 ? '' : 's'}</span></p>
                  ${reactions ? `<p class="award-reactions">${reactions}</p>` : ''}
                </figcaption>
              </figure>`;
          }).join('')}
        </section>`;
    };
    $('#awards').innerHTML = award('funable', '🔥 Más Funable', 'var(--pink)') + award('meme', '🏆 Meme de la Ronda', 'var(--lime)');
    if (awards.funable.length || awards.meme.length) {
      sfx.fanfare();
      confetti(70);
    }
  }
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  $('#scoreboard').innerHTML = ranked.map((p, i) => `
    <li class="score-row ${p.id === S.me ? 'is-me' : ''}" style="--c:${p.color}">
      <span class="rank">${i + 1}</span>${avatar(p)}<span class="pname">${esc(p.name)}</span>
      ${deltas[p.id] ? `<span class="delta">+${deltas[p.id]}</span>` : ''}
      <span class="score">${p.score}</span>
    </li>`).join('');
  const final = S.round >= S.settings.rounds;
  $('#results-cta').innerHTML = isHost()
    ? `<button class="btn btn-lime btn-xl" type="button" data-action="continue">${final ? 'Ver la sentencia final 🏆' : 'Siguiente ronda →'}</button>`
    : `<p class="waiting"><span class="dots"><i></i><i></i><i></i></span>Esperando al host</p>`;
}

function renderPodium() {
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  const key = `${S.code}:${ranked.map((p) => p.id).join()}`;
  if (ui.podiumKey !== key) {
    ui.podiumKey = key;
    const order = [1, 0, 2].filter((i) => ranked[i]);
    $('#podium-stage').innerHTML = order.map((i) => {
      const p = ranked[i];
      return `
        <div class="podium-col place-${i + 1}" style="--c:${p.color}">
          ${i === 0 ? '<span class="crown" aria-hidden="true">👑</span>' : ''}
          ${avatar(p)}
          <b class="pname">${esc(p.name)}</b>
          <span class="score">${p.score} pts</span>
          <div class="block"><span>${i + 1}</span></div>
        </div>`;
    }).join('');
    $('#podium-rest').innerHTML = ranked.slice(3).map((p, i) => `
      <li class="score-row" style="--c:${p.color}"><span class="rank">${i + 4}</span>${avatar(p)}<span class="pname">${esc(p.name)}</span><span class="score">${p.score}</span></li>`).join('');
    sfx.fanfare();
    confetti(140);
  }
  $('#podium-cta').innerHTML = isHost()
    ? `<button class="btn btn-lime btn-xl" type="button" data-action="restart">Otra partida</button>`
    : `<p class="waiting">El host decide si hay revancha</p>`;
}

// ---------- temporizador ----------

setInterval(() => {
  const timers = document.querySelectorAll('[data-timer]');
  if (!S?.timer || !ui.timerEnds) {
    timers.forEach((el) => (el.textContent = '--'));
    return;
  }
  const ms = Math.max(0, ui.timerEnds - Date.now());
  const sec = Math.ceil(ms / 1000);
  timers.forEach((el) => {
    el.textContent = sec;
    const box = el.closest('.timer');
    box.classList.toggle('urgent', sec <= 10);
    box.style.setProperty('--p', ui.timerTotal ? ms / ui.timerTotal : 0);
  });
  if (sec === ui.lastSecond) return;
  ui.lastSecond = sec;
  const key = `${S.phase}:${S.round}`;
  if (sec > 0 && sec <= 5) sfx.tick();
  if (sec === 0 && ui.alarmKey !== key && S.phase === 'drawing') {
    ui.alarmKey = key;
    sfx.alarm();
  }
}, 200);

// ---------- acciones ----------

async function enterRoom(mode) {
  unlockAudio();
  const nameInput = $('#name');
  const name = nameInput.value.trim();
  if (!name) {
    shake(nameInput, 6);
    nameInput.focus();
    return toast('Primero un apodo, criatura.', 'error');
  }
  const code = $('#code').value.trim().toUpperCase();
  if (mode === 'join' && !/^[A-Z]{4}$/.test(code)) {
    shake($('#code'), 6);
    return toast('El código son 4 letras.', 'error');
  }
  local.set('censored.name', name);
  const res = await emit(mode === 'join' ? 'room:join' : 'room:create', { name, pid, code });
  if (!res.ok) return;
  session.set('censored.room', res.code);
  history.replaceState(null, '', `?sala=${res.code}`);
  sfx.join();
}

async function submitDrawing() {
  if (ui.submitted || !S?.myEntry) return;
  ui.submitted = true;
  sfx.submit();
  const res = await emit('draw:submit', { image: board.toImage() });
  if (!res.ok) ui.submitted = false;
  if (S?.phase === 'drawing') renderDraw();
}

function setTool(tool) {
  board.commitText();
  board.tool = tool;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  $('#stage').dataset.tool = tool;
}

function updateSettings(setting, value) {
  const next = { ...S.settings };
  if (setting === 'categories') {
    const set = new Set(next.categories);
    set.has(value) ? set.delete(value) : set.add(value);
    if (!set.size) return toast('Deja al menos una categoría.', 'error');
    next.categories = [...set];
  } else {
    next[setting] = Number(value);
  }
  sfx.click();
  emit('room:settings', next);
}

function leave() {
  session.del('censored.room');
  location.href = location.pathname;
}

// ---------- eventos DOM ----------

// El botón principal siempre crea; Enter en los campos entra si hay código escrito.
$('#home-form').addEventListener('submit', (e) => {
  e.preventDefault();
  enterRoom('create');
});
for (const input of [$('#name'), $('#code')]) {
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    enterRoom($('#code').value.trim() ? 'join' : 'create');
  });
}
$('#join-btn').addEventListener('click', () => enterRoom('join'));
$('#code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

$('#copy-code').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?sala=${S.code}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Enlace copiado. Pégalo en Discord.');
  } catch {
    toast(`Código: ${S.code}`);
  }
  sfx.click();
});

$('#settings').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-value]');
  if (!btn || !isHost()) return;
  updateSettings(btn.closest('[data-setting]').dataset.setting, btn.dataset.value);
});

const actions = {
  start: () => emit('game:start'),
  'reveal-show': () => emit('reveal:show'),
  'reveal-next': () => emit('reveal:next'),
  continue: () => emit('game:continue'),
  restart: () => emit('game:restart'),
};
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  unlockAudio();
  sfx.click();
  actions[btn.dataset.action]?.();
});

// Toolbar
$('#swatches').innerHTML = INK.map((c, i) => `<button class="swatch" type="button" data-color="${c}" style="--sw:${c}" aria-label="Color ${c}" aria-pressed="${i === 0}"></button>`).join('')
  + '<label class="swatch custom" title="Color personalizado" style="--sw:conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"><input type="color" id="custom-color" value="#ff6a00" aria-label="Color personalizado"></label>';

function setColor(color, swatch) {
  board.color = color;
  for (const b of document.querySelectorAll('.swatch')) b.setAttribute('aria-pressed', String(b === swatch));
  $('#size-preview').style.background = color;
  if (board.tool === 'eraser') setTool('brush');
}
$('#swatches').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-color]');
  if (!btn) return;
  setColor(btn.dataset.color, btn);
  sfx.click();
});
$('#custom-color').addEventListener('input', (e) => {
  const swatch = e.target.parentElement;
  swatch.style.setProperty('--sw', e.target.value);
  setColor(e.target.value, swatch);
});

function setSize(size) {
  board.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
  $('#size-range').value = board.size;
  $('#size-value').textContent = board.size;
  // La vista previa se limita para no desbordar la barra; a partir de ahí el número manda.
  $('#size-preview').style.setProperty('--d', `${Math.min(board.size, 40)}px`);
}
$('#size-range').addEventListener('input', (e) => setSize(Number(e.target.value)));
setSize(board.size);
setColor(board.color, document.querySelector('.swatch'));
for (const btn of document.querySelectorAll('[data-tool]')) {
  btn.addEventListener('click', () => { setTool(btn.dataset.tool); sfx.click(); });
}
$('#undo-btn').addEventListener('click', () => board.undo() && sfx.click());
$('#clear-btn').addEventListener('click', () => board.clear() && sfx.submit());
$('#submit-drawing').addEventListener('click', submitDrawing);
setTool('brush');

document.addEventListener('keydown', (e) => {
  if (screen !== 'draw' || document.activeElement === $('#text-input')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    board.undo();
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const tool = { b: 'brush', e: 'eraser', f: 'fill', t: 'text', l: 'line', r: 'rect', o: 'ellipse', a: 'arrow' }[e.key.toLowerCase()];
    if (tool) setTool(tool);
    if (e.key === '[' || e.key === ']') setSize(board.size + (e.key === ']' ? 2 : -2));
  }
});

// Reacciones
$('#reactions').innerHTML = REACTIONS.map((r, i) => `<button class="react-btn" type="button" data-react="${r}" aria-label="Reaccionar ${r}" title="Tecla ${i + 1}">${r}</button>`).join('');
function react(emoji, btn) {
  socket.emit('react', { emoji });
  sfx.pop();
  btn?.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
}
$('#reactions').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-react]');
  if (btn) react(btn.dataset.react, btn);
});
document.addEventListener('keydown', (e) => {
  if (screen !== 'reveal' || e.repeat) return;
  const i = Number(e.key) - 1;
  if (REACTIONS[i]) react(REACTIONS[i], document.querySelectorAll('.react-btn')[i]);
});

// Votos
$('#vote-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('.vote-btn');
  if (!btn) return;
  sfx.vote();
  S.myVotes = { ...S.myVotes, [btn.dataset.kind]: btn.dataset.id };
  renderVote();
  await emit('vote', { kind: btn.dataset.kind, entryId: btn.dataset.id });
});

// Sonido / salir
const muteIcon = () => {
  $('#mute-btn').innerHTML = isMuted()
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
  $('#mute-btn').setAttribute('aria-label', isMuted() ? 'Activar sonido' : 'Silenciar sonido');
};
$('#mute-btn').addEventListener('click', () => { toggleMute(); muteIcon(); unlockAudio(); sfx.click(); });
$('#leave-btn').addEventListener('click', leave);
muteIcon();

// ---------- socket ----------

socket.on('state', (state) => {
  const previous = S;
  S = state;
  if (S.timer) {
    ui.timerEnds = Date.now() + S.timer.remaining;
    ui.timerTotal = S.timer.total;
  } else {
    ui.timerEnds = 0;
  }
  if (previous && previous.players.length < S.players.length && S.phase === 'lobby') sfx.join();
  render();
});

socket.on('draw:collect', () => {
  if (S?.phase === 'drawing' && !ui.submitted) submitDrawing();
});

socket.on('react', ({ emoji, color }) => flyEmoji(emoji, color));

socket.on('connect', async () => {
  const code = session.get('censored.room');
  const name = local.get('censored.name');
  if (!code || !name) return;
  const res = await new Promise((resolve) => socket.emit('room:join', { code, name, pid }, resolve));
  if (!res?.ok) {
    session.del('censored.room');
    S = null;
    render();
    toast(res?.error ?? 'No se pudo volver a la sala.', 'error');
  }
});

socket.on('disconnect', () => {
  if (S) toast('Conexión perdida. Reconectando…', 'error');
});

// ---------- arranque ----------

const params = new URLSearchParams(location.search);
$('#name').value = local.get('censored.name') ?? '';
const invited = params.get('sala');
if (invited) {
  $('#code').value = invited.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  $('#home-form').querySelector('[type=submit]').textContent = 'Crear otra sala';
}
document.fonts?.load('40px Anton');
render();
($('#name').value ? $('#code') : $('#name')).focus({ preventScroll: true });
