// Lienzo de dibujo basado en historial de acciones: deshacer = quitar la última y repintar.
export const BOARD_W = 960;
export const BOARD_H = 720;
export const SIZES = [
  { brush: 5, text: 38 },
  { brush: 12, text: 58 },
  { brush: 26, text: 88 },
];
const BG = '#ffffff';
const MEME_FONT = 'Anton, Impact, "Arial Black", sans-serif';

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export class Board {
  constructor(canvas, textInput) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = textInput;
    this.tool = 'brush';
    this.color = '#111111';
    this.sizeIndex = 1;
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
    this.canvas.setPointerCapture(e.pointerId);
    const eraser = this.tool === 'eraser';
    const size = SIZES[this.sizeIndex].brush;
    this.stroke = {
      type: 'stroke',
      color: eraser ? BG : this.color,
      size: eraser ? size * 2.2 : size,
      points: [this.#point(e)],
    };
    this.#dot(this.stroke);
  }

  #move(e) {
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
    const size = SIZES[this.sizeIndex].text;
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
