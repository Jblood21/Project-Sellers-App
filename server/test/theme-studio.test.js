import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { contrast, luminance, mix, normalizeHex, themeView } from '../../shared/customTheme.js';
import { CUSTOM_THEME, THEMES } from '../../shared/domain.js';
import {
  WHEEL_MIN_LIGHT, goesWellWith, hexToHsv, hsvToHex, hueStrengthToPoint, pointToHueStrength, stepWheel,
} from '../../client/src/admin/setup/colourWheel.js';
import { backends, startBackend } from './fixtures/harness.js';

/**
 * Setup's theme studio (client/src/admin/setup/ThemeStudio.jsx): the colour wheel's maths, the readability line it
 * shows for each set theme, and the requests its two "Use" buttons send.
 */

const here = dirname(fileURLToPath(import.meta.url));
const client = (file) => readFileSync(join(here, '../../client/src', file), 'utf8');

describe('the colour wheel', () => {
  test('a colour code survives the trip to hue, strength and lightness and back', () => {
    const codes = ['#000000', '#FFFFFF', '#808080', '#FF0000', '#00FF00', '#0000FF', '#5A1E33', '#E07A8A', '#FBF4F3', '#102A43', '#D4A72C'];
    for (let i = 0; i < 200; i += 1) codes.push(`#${((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`);
    for (const code of codes) assert.equal(hsvToHex(hexToHsv(code)), code, code);
  });

  test('red is at the top and the hues run clockwise, strength grows outward and stops at the rim', () => {
    const at = (dx, dy) => pointToHueStrength(dx, dy, 100);
    assert.deepEqual(at(0, -100), { h: 0, s: 1 });
    assert.equal(Math.round(at(100, 0).h), 90);
    assert.equal(Math.round(at(0, 100).h), 180);
    assert.equal(Math.round(at(-100, 0).h), 270);
    assert.equal(at(0, 0).s, 0, 'the centre is white');
    assert.equal(at(0, -50).s, 0.5);
    assert.equal(at(0, -400).s, 1, 'a drag past the rim stays at full strength');
    // What the conic-gradient paints there: red at the top, yellow a sixth of the way round, blue two thirds.
    assert.equal(hsvToHex({ ...at(0, -100), v: 1 }), '#FF0000');
    assert.equal(hsvToHex({ h: 60, s: 1, v: 1 }), '#FFFF00');
    assert.equal(hsvToHex({ h: 240, s: 1, v: 1 }), '#0000FF');
  });

  test('the marker is drawn where a click there would pick', () => {
    for (const [h, s] of [[0, 1], [90, 0.5], [200, 0.8], [330, 0.25]]) {
      const { x, y } = hueStrengthToPoint(h, s);
      const back = pointToHueStrength(x * 100, y * 100, 100);
      assert.ok(Math.abs(back.h - h) < 1e-6 && Math.abs(back.s - s) < 1e-6, `${h} ${s}`);
    }
  });

  test('the arrow keys go round the wheel and in and out, Shift takes bigger steps, and other keys are left alone', () => {
    const start = { h: 350, s: 0.98, v: 0.6 };
    assert.equal(stepWheel(start, 'ArrowRight').h, 355);
    assert.equal(stepWheel(start, 'ArrowRight', true).h, 20, 'round past red');
    assert.equal(stepWheel({ ...start, h: 2 }, 'ArrowLeft').h, 357);
    assert.equal(stepWheel(start, 'ArrowUp').s, 1, 'no stronger than full');
    assert.equal(stepWheel({ ...start, s: 0.02 }, 'ArrowDown').s, 0, 'no softer than white');
    assert.equal(stepWheel(start, 'ArrowUp').v, 0.6, 'lightness is the slider’s, not the wheel’s');
    for (const key of ['Tab', 'Enter', ' ', 'Home', 'a']) assert.equal(stepWheel(start, key), null, key);
    assert.ok(WHEEL_MIN_LIGHT > 0 && WHEEL_MIN_LIGHT < 1);
  });

  test('"Goes well with" offers five real colour codes, the lighter one lighter and the darker one darker', () => {
    for (const code of ['#5A1E33', '#FFFFFF', '#000000', '#808080', '#E07A8A']) {
      const hsv = hexToHsv(code);
      const swatches = goesWellWith(hsv);
      assert.deepEqual(swatches.map((swatch) => swatch.key), ['opposite', 'next', 'other', 'lighter', 'darker']);
      for (const swatch of swatches) assert.equal(normalizeHex(swatch.hex), swatch.hex, `${code} ${swatch.key}`);
      const byKey = Object.fromEntries(swatches.map((swatch) => [swatch.key, swatch.hex]));
      if (code !== '#FFFFFF') assert.ok(luminance(byKey.lighter) > luminance(code), `${code} lighter`);
      if (code !== '#000000') assert.ok(luminance(byKey.darker) < luminance(code), `${code} darker`);
    }
    const opposite = hexToHsv(goesWellWith(hexToHsv('#FF0000'))[0].hex);
    assert.equal(Math.round(opposite.h), 180, 'straight across the wheel from red is cyan');
  });
});

// The colours each set theme paints with, as base.css declares them: what the studio reads at runtime.
function cssTokens() {
  const css = readFileSync(join(here, '../../client/src/styles/base.css'), 'utf8');
  const out = {};
  for (const [, key, body] of css.matchAll(/\.t-([a-z]+) \{([^}]*)\}/g)) {
    out[key] = Object.fromEntries([...body.matchAll(/--t-([a-zA-Z0-9]+):\s*([^;]+);/g)].map(([, name, value]) => [name, normalizeHex(value)]));
  }
  return out;
}

test('every set theme passes the six checks the studio reads out, so "Every word is easy to read" is true of each', () => {
  const tokens = cssTokens();
  for (const key of Object.keys(THEMES)) {
    const t = tokens[key];
    assert.ok(t, `${key} is in base.css`);
    const lowest = Math.min(
      contrast(t.ink, t.bg), contrast(t.onacc2, t.acc2), contrast(t.acc2, t.bg), contrast(t.acc2, t.sur), contrast(t.onacc, t.acc),
      contrast(t.accT, t.bg), contrast(t.accT, t.sur), contrast(t.mut, t.bg), contrast(t.mut, t.sur),
    );
    assert.ok(lowest >= 4.5, `${key}: lowest ${lowest.toFixed(2)} to 1`);
    // "Start from" takes these three; each must be a colour code the server stores.
    for (const name of ['acc2', 'acc', 'bg']) assert.ok(t[name], `${key} --t-${name} is a colour code`);
  }
});

// The claim is about the theme's own pairs, so a layout that lays muted text on a ground of its own must keep it
// readable there itself. Marketplace's lead questions sit on the accent's tint, where the plain muted text of four
// themes is under 4.5:1; a little of the ink in it takes every theme past it.
test("Marketplace's questions on the tint read at 4.5:1 or better in every set theme", () => {
  const css = readFileSync(join(here, '../../client/src/styles/layouts/marketplace.css'), 'utf8');
  const rule = css.match(/\.mk-lead__q \{[^}]*color: color-mix\(in srgb, var\(--t-mut\) (\d+)%, var\(--t-ink\)\)/);
  assert.ok(rule, 'the question is drawn in muted text with some ink in it');
  const share = Number(rule[1]) / 100;
  const tokens = cssTokens();
  for (const key of Object.keys(THEMES)) {
    const t = tokens[key];
    const ratio = contrast(mix(t.mut, t.ink, share), t.tint);
    assert.ok(ratio >= 4.5, `${key}: ${ratio.toFixed(2)} to 1 on the tint`);
  }
});

test('the studio moves the keyboard on purpose when what it was on goes away', () => {
  const studio = client('admin/setup/ThemeStudio.jsx');
  for (const target of ['editor', 'ownRow', 'now']) assert.match(studio, new RegExp(`focusAfter\\.current = (key === CUSTOM_THEME \\? )?'${target}'`), target);
  assert.match(studio, /className="ax-studio__now" ref=\{nowRef\} tabIndex=\{-1\}/);
  assert.match(client('admin/setup/OwnColours.jsx'), /className="ax-own__title" ref=\{titleRef\} tabIndex=\{-1\}/);
  // Phone-only is the window's phone width, the same 559px admin-extras.css switches at.
  assert.match(studio, /const PHONE_WINDOW = '\(max-width: 559px\)'/);
  assert.match(client('styles/admin-extras.css'), /@media \(max-width: 559px\)/);
});

test('the studio only ever posts to its own frames at its own origin, and sends your own colours with the theme', () => {
  const studio = client('admin/setup/ThemeStudio.jsx');
  assert.match(studio, /postMessage\(messageRef\.current, window\.location\.origin\)/);
  assert.doesNotMatch(studio, /postMessage\([^)]*'\*'/);
  assert.match(studio, /event\.origin !== window\.location\.origin/);
  assert.match(studio, /\{ theme: CUSTOM_THEME, settings: customSettings \}/, '"Use these colours" is one request');
  // The frames are pictures: clicks off, and out of the Tab order.
  assert.match(studio, /tabIndex=\{-1\}/);
  assert.match(client('styles/admin-extras.css'), /\.ax-frame iframe \{[^}]*pointer-events: none/);
  // Setup no longer has a theme grid of its own: the studio is the one place a theme is chosen.
  const setup = client('admin/tabs/SetupTab.jsx');
  assert.match(setup, /<ThemeStudio community=\{community\} reload=\{reload\} \/>/);
  assert.doesNotMatch(setup, /THEME_CHIPS|Buyer app theme/);
});

for (const kind of backends()) {
  describe(`the studio's Use buttons over the API (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    before(async () => {
      app = await startBackend(kind, 'theme_studio');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Studio Colours' } })).body.id;
    });
    after(() => app.stop());

    const patch = (body) => api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body });
    const read = async () => (await api(`/api/admin/communities/${cid}`, { token })).body;
    const ownColours = { customBrand: '#2F4858', customButton: '#F7E9A0', customPage: '#FFFDF7', customBase: 'clay' };

    test('"Use these colours" works first time, on a community that has never saved a colour', async () => {
      assert.equal((await read()).settings.customBrand, '');
      const res = await patch({ theme: CUSTOM_THEME, settings: ownColours });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const saved = await read();
      assert.equal(saved.theme, CUSTOM_THEME);
      for (const [key, value] of Object.entries(ownColours)) assert.equal(saved.settings[key], value, key);
      // What a buyer is sent, through the same themeView the studio named it with.
      const buyer = (await api(`/api/c/${cid}`)).body;
      const view = themeView(buyer.theme, buyer.settings);
      assert.equal(view.name, 'Custom colours');
      assert.match(view.className, /^t-clay t-custom/);
      assert.equal(view.style['--t-acc'], '#F7E9A0');
    });

    test('"Use" on a set theme leaves your own colours saved, to go back to', async () => {
      assert.equal((await patch({ theme: 'wine' })).status, 200);
      const saved = await read();
      assert.equal(saved.theme, 'wine');
      assert.equal(saved.settings.customButton, '#F7E9A0');
      assert.equal((await patch({ theme: CUSTOM_THEME, settings: ownColours })).status, 200);
      assert.equal((await read()).theme, CUSTOM_THEME);
    });

    test('a colour typed in lower case, without the #, is stored as the code the studio then shows', async () => {
      const res = await patch({ theme: CUSTOM_THEME, settings: { ...ownColours, customBrand: '2f4858' } });
      assert.equal(res.status, 200);
      assert.equal((await read()).settings.customBrand, '#2F4858');
    });

    test('a refusal comes back as words the studio can show', async () => {
      const res = await patch({ theme: CUSTOM_THEME, settings: { ...ownColours, customPage: 'cream' } });
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
      assert.ok(res.body.error.length > 10);
      assert.equal((await read()).settings.customPage, '#FFFDF7', 'nothing changed');
    });
  });
}
