// Lienzo de dibujo basado en historial de acciones: deshacer = quitar la última y repintar.
export const BOARD_W = 960;
export const BOARD_H = 720;
export const MIN_SIZE = 2;
export const MAX_SIZE = 60;
export const SHAPES = ['line', 'rect', 'ellipse', 'arrow'];
const BG = '#ffffff';
const FILL_TOLERANCE = 48; // diferencia máx. por canal para que el balde atraviese bordes antialias
const MEME_FONT = 'Anton, Impact, "Arial Black", sans-serif';

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const textSize = (brush) => Math.min(120, Math.round(24 + brush * 2.4));

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isDark(hex) {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export class Board {
  constructor(canvas, textInput) {
    this.canvas = canvas;
    // El balde lee píxeles en cada relleno (y al repintar tras deshacer).
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.input = textInput;
    this.tool = 'brush';
    this.color = '#111111';
    this.size = 12;
    this.locked = false;
    this.onChange = () => {};

    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    canvas.addEventListener('pointerup', () => this.#up());
    canvas.addEventListener('pointercancel', () => this.#up());
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.commitText(); }
      if (e.key === 'Escape') { this.pendingText = null; this.input.hidden = true; }
    });
    textInput.addEventListener('blur', () => this.commitText());
    this.reset();
  }

  reset() {
    this.actions = [];
    this.stroke = null;
    this.shape = null;
    this.pendingText = null;
    this.input.hidden = true;
    this.redraw();
  }

  setLocked(locked) {
    this.locked = locked;
    if (locked) this.commitText();
  }

  undo() {
    this.commitText();
    if (!this.actions.length) return false;
    this.actions.pop();
    this.redraw();
    this.onChange();
    return true;
  }

  clear() {
    this.commitText();
    if (this.isEmpty()) return false;
    this.actions.push({ type: 'clear' });
    this.redraw();
    this.onChange();
    return true;
  }

  isEmpty() {
    const lastClear = this.actions.findLastIndex((a) => a.type === 'clear');
    return lastClear === this.actions.length - 1;
  }

  // null si no hay nada dibujado: el servidor lo trata como "no entregó pruebas".
  toImage() {
    this.commitText();
    return this.isEmpty() ? null : this.canvas.toDataURL('image/jpeg', 0.82);
  }

  redraw() {
    const { ctx } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    for (const action of this.actions) {
      if (action.type === 'clear') {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, BOARD_W, BOARD_H);
      } else if (action.type === 'stroke') {
        this.#drawStroke(action);
      } else if (action.type === 'fill') {
        this.#fill(action);
      } else if (action.type === 'shape') {
        this.#drawShape(action);
      } else {
        this.#drawText(action);
      }
    }
  }

  commitText() {
    const pending = this.pendingText;
    if (!pending) return;
    this.pendingText = null;
    const text = this.input.value.trim().toUpperCase();
    this.input.hidden = true;
    if (!text) return;
    const action = { type: 'text', ...pending, text };
    this.actions.push(action);
    this.#drawText(action);
    this.onChange();
  }

  #point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * BOARD_W) / r.width, y: ((e.clientY - r.top) * BOARD_H) / r.height };
  }

  #down(e) {
    if (this.locked || e.button > 0) return;
    e.preventDefault();
    if (this.tool === 'text') return this.#openText(e);
    this.commitText();
    if (this.tool === 'fill') return this.#addFill(this.#point(e));
    this.canvas.setPointerCapture(e.pointerId);
    const { size } = this;
    if (SHAPES.includes(this.tool)) {
      const p = this.#point(e);
      // La vista previa se pinta sobre una copia del lienzo en vez de repintar todo el historial.
      this.snapshot = this.ctx.getImageData(0, 0, BOARD_W, BOARD_H);
      this.shape = { type: 'shape', shape: this.tool, color: this.color, size, from: p, to: p };
      return;
    }
    const eraser = this.tool === 'eraser';
    this.stroke = {
      type: 'stroke',
      color: eraser ? BG : this.color,
      size: eraser ? size * 2.2 : size,
      points: [this.#point(e)],
    };
    this.#dot(this.stroke);
  }

  #move(e) {
    if (this.shape) {
      this.shape.to = this.#point(e);
      this.ctx.putImageData(this.snapshot, 0, 0);
      this.#drawShape(this.shape);
      return;
    }
    if (!this.stroke) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) this.#extend(this.#point(ev));
  }

  // Trazo suavizado por puntos medios; el repintado en #drawStroke usa la misma curva.
  #extend(p) {
    const pts = this.stroke.points;
    const last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
    pts.push(p);
    const n = pts.length;
    const ctx = this.#style(this.stroke);
    ctx.beginPath();
    if (n === 2) {
      const m = mid(pts[0], pts[1]);
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(m.x, m.y);
    } else {
      const a = mid(pts[n - 3], pts[n - 2]);
      const b = mid(pts[n - 2], pts[n - 1]);
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(pts[n - 2].x, pts[n - 2].y, b.x, b.y);
    }
    ctx.stroke();
  }

  #up() {
    if (this.shape) {
      const { shape } = this;
      this.shape = null;
      this.snapshot = null;
      if (Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) < 3) return this.redraw();
      this.actions.push(shape);
      this.onChange();
      return;
    }
    if (!this.stroke) return;
    const pts = this.stroke.points;
    if (pts.length > 1) {
      const ctx = this.#style(this.stroke);
      const m = mid(pts[pts.length - 2], pts[pts.length - 1]);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    this.actions.push(this.stroke);
    this.stroke = null;
    this.onChange();
  }

  #style({ color, size }) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  #dot({ color, size, points: [p] }) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawStroke(stroke) {
    const pts = stroke.points;
    if (pts.length === 1) return this.#dot(stroke);
    const ctx = this.#style(stroke);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    const first = mid(pts[0], pts[1]);
    ctx.lineTo(first.x, first.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  #drawShape({ shape, color, size, from, to }) {
    const ctx = this.#style({ color, size });
    ctx.beginPath();
    if (shape === 'rect') {
      ctx.rect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else if (shape === 'ellipse') {
      const rx = Math.abs(to.x - from.x) / 2;
      const ry = Math.abs(to.y - from.y) / 2;
      ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      if (shape === 'arrow') {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const head = Math.min(Math.max(18, size * 3), Math.hypot(to.x - from.x, to.y - from.y) * 0.6);
        for (const side of [-1, 1]) {
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - head * Math.cos(angle + side * 0.5), to.y - head * Math.sin(angle + side * 0.5));
        }
      }
    }
    ctx.stroke();
  }

  #addFill(p) {
    const action = { type: 'fill', x: Math.floor(p.x), y: Math.floor(p.y), color: this.color };
    if (!this.#fill(action)) return;
    this.actions.push(action);
    this.onChange();
  }

  // Relleno por líneas de barrido con tolerancia; devuelve false si no cambió nada.
  #fill({ x, y, color }) {
    if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H) return false;
    const img = this.ctx.getImageData(0, 0, BOARD_W, BOARD_H);
    const data = img.data;
    const start = (y * BOARD_W + x) * 4;
    const target = [data[start], data[start + 1], data[start + 2]];
    const fill = rgb(color);
    if (fill.every((c, i) => c === target[i])) return false;
    const matches = (i) => {
      const o = i * 4;
      return Math.abs(data[o] - target[0]) <= FILL_TOLERANCE
        && Math.abs(data[o + 1] - target[1]) <= FILL_TOLERANCE
        && Math.abs(data[o + 2] - target[2]) <= FILL_TOLERANCE;
    };
    const mask = new Uint8Array(BOARD_W * BOARD_H);
    const stack = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop();
      let lx = px;
      const row = py * BOARD_W;
      if (mask[row + lx] || !matches(row + lx)) continue;
      while (lx > 0 && !mask[row + lx - 1] && matches(row + lx - 1)) lx--;
      let rx = px;
      while (rx < BOARD_W - 1 && !mask[row + rx + 1] && matches(row + rx + 1)) rx++;
      for (let i = lx; i <= rx; i++) {
        mask[row + i] = 1;
        if (py > 0 && !mask[row - BOARD_W + i]) stack.push([i, py - 1]);
        if (py < BOARD_H - 1 && !mask[row + BOARD_W + i]) stack.push([i, py + 1]);
      }
    }
    // Se pinta también 1 px alrededor para tapar el halo antialias, sin comerse el núcleo del trazo.
    const paint = (i) => {
      const o = i * 4;
      const diff = Math.max(Math.abs(data[o] - target[0]), Math.abs(data[o + 1] - target[1]), Math.abs(data[o + 2] - target[2]));
      if (!mask[i] && diff > FILL_TOLERANCE * 3) return;
      data[o] = fill[0];
      data[o + 1] = fill[1];
      data[o + 2] = fill[2];
      data[o + 3] = 255;
    };
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      paint(i);
      const col = i % BOARD_W;
      if (col > 0 && !mask[i - 1]) paint(i - 1);
      if (col < BOARD_W - 1 && !mask[i + 1]) paint(i + 1);
      if (i >= BOARD_W && !mask[i - BOARD_W]) paint(i - BOARD_W);
      if (i + BOARD_W < mask.length && !mask[i + BOARD_W]) paint(i + BOARD_W);
    }
    this.ctx.putImageData(img, 0, 0);
    return true;
  }

  #drawText({ x, y, text, color, size }) {
    const { ctx } = this;
    ctx.font = `${size}px ${MEME_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = isDark(color) ? '#ffffff' : '#000000';
    ctx.fillStyle = color;
    const maxWidth = BOARD_W - 32;
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillText(text, x, y, maxWidth);
  }

  #openText(e) {
    this.commitText();
    const p = this.#point(e);
    const r = this.canvas.getBoundingClientRect();
    const size = textSize(this.size);
    this.pendingText = { x: p.x, y: p.y, color: this.color, size };
    Object.assign(this.input.style, {
      left: `${e.clientX - r.left}px`,
      top: `${e.clientY - r.top}px`,
      fontSize: `${size * (r.width / BOARD_W)}px`,
      color: this.color,
    });
    this.input.style.setProperty('--outline', isDark(this.color) ? '#fff' : '#000');
    this.input.value = '';
    this.input.hidden = false;
    this.input.focus();
  }
}
