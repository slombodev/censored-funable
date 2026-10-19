import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHeadline } from '../headlines.js';

const names = (h) => h.parts.filter((p) => p.type === 'name').map((p) => p.value);

test('Caos Random usa hasta 3 jugadores distintos y nunca deja huecos sin nombre', () => {
  const used = new Set();
  for (let i = 0; i < 40; i++) {
    const h = generateHeadline(['caos'], ['Ana', 'Bo'], used);
    assert.equal(h.category, 'caos');
    assert.ok(names(h).every(Boolean), 'con 2 jugadores no salen plantillas de 3');
  }
  const trio = Array.from({ length: 40 }, () => generateHeadline(['caos'], ['Ana', 'Bo', 'Cy'], used));
  assert.ok(trio.some((h) => new Set(names(h)).size === 3));
});

test('Picante genera titulares con censura', () => {
  const h = generateHeadline(['picante'], ['Ana', 'Bo'], new Set());
  assert.equal(h.category, 'picante');
  assert.equal(h.parts.filter((p) => p.type === 'blank').length, 1);
});
