const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const layer = () => document.getElementById('fx');
const MAX_FLYING = 70;

export function flyEmoji(emoji, color) {
  const root = layer();
  if (root.childElementCount > MAX_FLYING) return;
  const el = document.createElement('span');
  el.className = 'fly';
  el.textContent = emoji;
  el.style.left = `${6 + Math.random() * 88}vw`;
  el.style.setProperty('--glow', color);
  root.append(el);
  const drift = (Math.random() - 0.5) * 180;
  const rise = innerHeight * (0.5 + Math.random() * 0.45);
  const spin = (Math.random() - 0.5) * 70;
  const frames = reduceMotion.matches
    ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }]
    : [
        { transform: 'translate(0, 0) scale(.3)', opacity: 0 },
        { transform: `translate(${drift * 0.3}px, ${-rise * 0.25}px) scale(1.3) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${drift}px, ${-rise}px) scale(.9) rotate(${spin}deg)`, opacity: 0 },
      ];
  el.animate(frames, { duration: 1500 + Math.random() * 900, easing: 'cubic-bezier(.15,.7,.3,1)' }).onfinish = () => el.remove();
}

export function confetti(count = 90) {
  if (reduceMotion.matches) return;
  const root = layer();
  const colors = ['#c8ff2e', '#ff2d87', '#2de2ff', '#ffb800', '#f3efe6'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    el.className = 'confetti';
    el.style.background = colors[i % colors.length];
    el.style.left = `${50 + (Math.random() - 0.5) * 20}vw`;
    root.append(el);
    const angle = Math.random() * Math.PI - Math.PI;
    const power = 250 + Math.random() * 450;
    const x = Math.cos(angle) * power;
    const y = Math.sin(angle) * power;
    el.animate(
      [
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        { transform: `translate(${x}px, ${y}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${x * 1.2}px, ${y + innerHeight}px) rotate(${Math.random() * 1440}deg)`, opacity: 0 },
      ],
      { duration: 2200 + Math.random() * 1200, easing: 'cubic-bezier(.2,.6,.4,1)' },
    ).onfinish = () => el.remove();
  }
}

export function flash() {
  if (reduceMotion.matches) return;
  const el = document.createElement('div');
  el.className = 'flash';
  layer().append(el);
  el.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' }).onfinish = () => el.remove();
}

export function shake(el, strength = 10) {
  if (!el || reduceMotion.matches) return;
  const s = strength;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-s}px, ${s / 2}px) rotate(-1deg)` },
      { transform: `translate(${s}px, ${-s / 2}px) rotate(1deg)` },
      { transform: `translate(${-s / 2}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 320, easing: 'ease-out' },
  );
}
