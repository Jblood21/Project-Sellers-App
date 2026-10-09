import assert from 'node:assert/strict';
import test from 'node:test';

import { fitHeadingSize } from '../../shared/fitText.js';

/**
 * A stand-in for the browser: text of `chars` characters, each about half the font size wide, wrapped
 * into a column `width` pixels wide. More characters or a bigger size means more lines, as in a real page.
 */
const linesFor = (chars, width) => (px) => Math.max(1, Math.ceil((chars * px * 0.5) / width));
const BASE = 32;
const WIDTH = 350;

const fit = (name) => fitHeadingSize({ base: BASE, linesAt: linesFor(`Welcome to ${name}`.length, WIDTH) });

test('a short name is made bigger than the layout\'s own size, within limits', () => {
  const size = fit('Oak');
  assert.equal(size, 38.4, 'one short line has room, so it takes the most it is allowed');
});

test('a longer name is made smaller until it fits in two lines', () => {
  const name = 'Willow Creek Estates at the Lake';
  const size = fit(name);
  assert.ok(size < BASE * 1.2 && size >= BASE * 0.8, `${size}px`);
  assert.ok(linesFor(`Welcome to ${name}`.length, WIDTH)(size) <= 2, 'and it really is two lines or fewer');
});

test('a very long name takes three lines at a smaller size, never a bigger one than a shorter name gets', () => {
  const name = 'The Preserve at Cottonwood Heights Phase Two Townhomes';
  const size = fit(name);
  assert.ok(size <= BASE * 0.8, `${size}px is no bigger than the comfortable size`);
  assert.ok(size >= BASE * 0.65, 'and not below the floor');
  assert.equal(linesFor(`Welcome to ${name}`.length, WIDTH)(size), 3, 'it takes three lines');
  assert.ok(Math.abs(size - BASE * 0.8) < 1e-9, 'at exactly the comfortable size, which is where a third line is allowed to begin');
});

test('a longer name is never given a bigger size than a shorter one', () => {
  let previous = Infinity;
  for (let length = 1; length <= 90; length += 1) {
    const size = fitHeadingSize({ base: BASE, linesAt: linesFor(11 + length, WIDTH) });
    assert.ok(size <= previous, `${length} characters: ${size}px after ${previous}px`);
    previous = size;
  }
});

test('a name that cannot fit still gets a size: the floor', () => {
  const size = fitHeadingSize({ base: BASE, linesAt: () => 9 });
  assert.equal(size, BASE * 0.65);
});

test('the answer always fits where the stand-in browser says it can, across widths and lengths', () => {
  for (const width of [260, 320, 350, 480, 900]) {
    for (let length = 1; length <= 80; length += 3) {
      const linesAt = linesFor(11 + length, width);
      const size = fitHeadingSize({ base: BASE, linesAt });
      assert.ok(size >= BASE * 0.65 && size <= BASE * 1.2, `${size}px is within the allowed range`);
      const floor = BASE * 0.65;
      // Whenever three lines are possible at all, the size chosen is on three lines or fewer.
      if (linesAt(floor) <= 3) assert.ok(linesAt(size) <= 3, `${length} characters at ${width}px wide: ${linesAt(size)} lines at ${size}px`);
    }
  }
});

test('the size is the biggest that fits: a little more would break the limit it was chosen for', () => {
  for (const base of [32, 35.1, 52.8]) {
    for (const width of [300, 350, 480]) {
      for (let length = 2; length <= 60; length += 2) {
        const linesAt = linesFor(11 + length, width);
        const size = fitHeadingSize({ base, linesAt });
        const atBound = size >= base * 1.2 - 0.15 || size <= base * 0.65 + 0.15 || Math.abs(size - base * 0.8) < 0.15;
        if (atBound) continue;
        const limit = size >= base * 0.8 ? 2 : 3;
        assert.ok(linesAt(size) <= limit, `base ${base}, ${length} characters, ${width}px wide: ${linesAt(size)} lines at ${size}px`);
        assert.ok(linesAt(size + 0.2) > limit, `base ${base}, ${length} characters, ${width}px wide: ${size}px left room to grow`);
      }
    }
  }
});

test('sizes are to a tenth of a pixel, and nothing to size from is null', () => {
  const size = fit('Willow Creek');
  assert.equal(Math.round(size * 10), size * 10);
  assert.equal(fitHeadingSize({ base: 0, linesAt: () => 1 }), null);
  assert.equal(fitHeadingSize({ base: Number.NaN, linesAt: () => 1 }), null);
  assert.equal(fitHeadingSize({ base: 32 }), null);
});
