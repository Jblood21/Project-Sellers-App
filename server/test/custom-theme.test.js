import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  CUSTOM_THEME, DEFAULT_SETTINGS, DEFAULT_THEME, THEMES, isThemeKey, normalizeTheme,
} from '../../shared/domain.js';
import {
  CUSTOM_KEYS, contrast, customThemeFrom, deriveTheme, luminance, mix, normalizeHex, themeView,
} from '../../shared/customTheme.js';
import { buildLeadsPdf } from '../lib/pdfReports.js';
import { backends, startBackend } from './fixtures/harness.js';
import { readPdf } from './fixtures/pdfText.js';

// Every pair a buyer reads, as base.css promises them for the set themes.
function assertReadable(vars, label) {
  const v = (name) => vars[`--t-${name}`];
  const pairs = [
    ['ink', 'bg', 7], ['ink', 'sur', 7],
    ['mut', 'bg', 4.5], ['mut', 'sur', 4.5], ['mut', 'tint', 4.5], ['mut', 'tint2', 4.5],
    ['accT', 'bg', 4.5], ['accT', 'sur', 4.5], ['accT', 'tint', 4.5],
    ['onacc', 'acc', 4.5], ['onacc2', 'acc2', 4.5],
    // The brand colour as words on the light grounds: Trailhead's footer, the outline buttons, Salt Grass's titles.
    ['acc2', 'bg', 4.5], ['acc2', 'sur', 4.5], ['acc2', 'tint', 4.5], ['acc2', 'tint2', 4.5],
  ];
  for (const [fg, ground, min] of pairs) {
    const ratio = contrast(v(fg), v(ground));
    assert.ok(ratio >= min, `${label}: ${fg} on ${ground} is ${ratio.toFixed(2)}:1, under ${min}`);
  }
  assert.ok(luminance(v('bg')) >= 0.7, `${label}: the page stays light`);
}

test('a colour code is six hex digits, with or without the #, in any case', () => {
  assert.equal(normalizeHex('#5a1e33'), '#5A1E33');
  assert.equal(normalizeHex('5A1E33'), '#5A1E33');
  assert.equal(normalizeHex(' #e07a8a '), '#E07A8A');
  for (const bad of ['', null, undefined, '#abc', 'red', '#12345G', 'rgb(1,2,3)', '#1234567']) {
    assert.equal(normalizeHex(bad), null, String(bad));
  }
});

test('three picked colours become a full palette in which every word can be read', () => {
  const picks = [
    ['#5A1E33', '#E07A8A', '#FBF4F3'],
    ['#102A43', '#D4A72C', '#F7F9FC'],
    ['#FFFF00', '#00FFFF', '#FFFFFF'], // everything too light
    ['#000000', '#000000', '#000000'], // everything too dark
    ['#808080', '#808080', '#808080'], // mid grey everywhere
    ['#2E7D32', '#FF7043', '#0D1B2A'], // a dark page
  ];
  // And a spread of colours from all round the wheel and up and down in lightness.
  for (let i = 0; i < 60; i += 1) {
    const hue = (n) => `#${[0, 1, 2].map((k) => ((n * (k + 3) * 37 + k * 91) % 256).toString(16).padStart(2, '0')).join('')}`;
    picks.push([hue(i * 7 + 1), hue(i * 11 + 5), hue(i * 13 + 9)]);
  }
  for (const [brand, button, page] of picks) {
    const theme = deriveTheme({ brand, button, page });
    assert.ok(theme, `${brand} ${button} ${page}`);
    assertReadable(theme.vars, `${brand} ${button} ${page}`);
  }
});

test('a colour that had to move is reported in words, and one that did not is left as picked', () => {
  const kept = deriveTheme({ brand: '#102A43', button: '#1E40AF', page: '#F7F9FC' });
  assert.deepEqual(kept.fixes, [], 'nothing to fix');
  assert.equal(kept.vars['--t-acc2'], '#102A43');
  assert.equal(kept.vars['--t-acc'], '#1E40AF');
  assert.equal(kept.vars['--t-bg'], '#F7F9FC');

  // A light rose button: white words on it fail, so the words go dark; and as text it is too light.
  const rose = deriveTheme({ brand: '#5A1E33', button: '#E07A8A', page: '#FBF4F3' });
  assert.equal(rose.vars['--t-acc'], '#E07A8A', 'the button keeps its colour');
  assert.ok(contrast(rose.vars['--t-onacc'], '#E07A8A') >= 4.5);
  assert.notEqual(rose.vars['--t-onacc'], '#FFFFFF');
  assert.deepEqual(rose.fixes.map((fix) => fix.key).sort(), ['accT', 'button']);
  assert.ok(rose.buttonNeedsEdge, 'rose on blush is under 3:1, so buttons get an edge');

  // A pale brand colour cannot carry white words: it is darkened, and the change is said.
  const pale = deriveTheme({ brand: '#A7D8F0', button: '#1E40AF', page: '#FFFFFF' });
  assert.ok(pale.fixes.some((fix) => fix.key === 'brand' && /Darkened to #/.test(fix.detail)));
  // A dark page is lightened.
  const night = deriveTheme({ brand: '#102A43', button: '#1E40AF', page: '#111827' });
  assert.ok(night.fixes.some((fix) => fix.key === 'page'));
  assert.equal(deriveTheme({ brand: 'nope', button: '#1E40AF', page: '#FFFFFF' }), null);
});

test('the brand colour is darkened for the words written in it on the page, not only for the white words on it', () => {
  // A red brand on a pale blue page: white on the red needs a little darker, words in it on the blue more still.
  const loud = deriveTheme({ brand: '#E53935', button: '#FFEB3B', page: '#E3F2FD' });
  const acc2 = loud.vars['--t-acc2'];
  assert.ok(contrast(acc2, loud.vars['--t-bg']) >= 4.5, `brand on the page ${contrast(acc2, loud.vars['--t-bg']).toFixed(2)}`);
  const brand = loud.fixes.find((fix) => fix.key === 'brand');
  assert.deepEqual(brand.checks, ['header', 'brandText'], 'moved for both, and says so');
  assert.match(brand.detail, /white words on it, and words in it on the page/);
  const row = loud.checks.find((check) => check.key === 'brandText');
  assert.equal(row.title, 'Words in your brand colour');
  assert.ok(row.ratio >= 4.5 && row.fixed);

  // White on it already reads, the page does not (a green brand on a pale green page): moved for the page
  // alone, and the words say only that.
  const green = deriveTheme({ brand: '#2E7D32', button: '#1E40AF', page: '#DCEDC8' });
  assert.ok(contrast('#FFFFFF', '#2E7D32') >= 4.5, 'white already clears the picked brand');
  const fix = green.fixes.find((item) => item.key === 'brand');
  assert.deepEqual(fix.checks, ['brandText']);
  assert.match(fix.detail, /words in your brand colour stay easy to read on the page/);
  assert.ok(contrast(green.vars['--t-acc2'], green.vars['--t-bg']) >= 4.5);
  // A realistic orange on an off-white page (4.2:1 for white, 3.9:1 on the page as picked).
  const orange = deriveTheme({ brand: '#D35400', button: '#1E40AF', page: '#FDF6EC' });
  assert.ok(orange.checks.every((check) => check.ratio >= 4.5));

  // A dark brand on a light page is left exactly as picked.
  const kept = deriveTheme({ brand: '#102A43', button: '#1E40AF', page: '#F7F9FC' });
  assert.equal(kept.vars['--t-acc2'], '#102A43');
  assert.equal(kept.checks.find((check) => check.key === 'brandText').fixed, false);
});

test('every colour moved is reported under the checks it was moved for, and only those are marked fixed', () => {
  const picks = [['#E53935', '#FFEB3B', '#E3F2FD'], ['#777777', '#777777', '#777777'], ['#5A1E33', '#E07A8A', '#FBF4F3'], ['#A7D8F0', '#1E40AF', '#FFFFFF']];
  for (let i = 0; i < 40; i += 1) {
    const hex = (n) => `#${((n * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0')}`;
    picks.push([hex(i * 3 + 1), hex(i * 3 + 2), hex(i * 3 + 3)]);
  }
  for (const [brand, button, page] of picks) {
    const theme = deriveTheme({ brand, button, page });
    const keys = theme.checks.map((check) => check.key);
    for (const fix of theme.fixes) {
      assert.ok(fix.checks.length > 0, `${brand} ${button} ${page}: ${fix.key} names what it fixed`);
      for (const key of fix.checks) assert.ok(keys.includes(key), `${fix.key} -> ${key} is a check Setup shows`);
    }
    for (const check of theme.checks) {
      assert.equal(check.fixed, theme.fixes.some((fix) => fix.checks.includes(check.key)), `${brand} ${button} ${page}: ${check.key}`);
      assert.ok(check.ratio >= 4.5, `${brand} ${button} ${page}: ${check.key} ${check.ratio.toFixed(2)}`);
    }
  }
});

test("a button colour that shows on the brand colour but not on Ledger's gauge track counts as faint there", () => {
  // The three set themes Ledger already lists for this reason, used as a builder's own colours: each clears 3:1
  // against its brand colour but not against the track (white at 20% over the brand colour).
  for (const [label, brand, button, page] of [
    ['Forest-like', '#1F4D3A', '#D8B56A', '#F8F5ED'],
    ['Bronze-like', '#242224', '#B68A52', '#FAF8F5'],
    ['Clay-like', '#3F3A34', '#C48A5A', '#F4EFE8'],
  ]) {
    const theme = deriveTheme({ brand, button, page });
    const acc = theme.vars['--t-acc'];
    const acc2 = theme.vars['--t-acc2'];
    assert.ok(contrast(acc, acc2) >= 3, `${label}: clears the brand colour`);
    assert.ok(contrast(acc, mix('#FFFFFF', acc2, 0.2)) < 3, `${label}: not the track`);
    assert.equal(theme.weakAccentOnDark, true, label);
    assert.match(themeView(CUSTOM_THEME, { customBrand: brand, customButton: button, customPage: page }).className, /t-acc-weak/, label);
  }
  // One that clears both keeps its own highlight.
  const strong = deriveTheme({ brand: '#102A43', button: '#F2C94C', page: '#F7F9FC' });
  assert.ok(contrast(strong.vars['--t-acc'], mix('#FFFFFF', strong.vars['--t-acc2'], 0.2)) >= 3);
  assert.equal(strong.weakAccentOnDark, false);
});

test("a key every object inherits (toString, constructor, __proto__) is never taken for a theme", () => {
  for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.equal(isThemeKey(key), false, key);
    assert.equal(normalizeTheme(key), DEFAULT_THEME, key);
    const view = themeView(CUSTOM_THEME, { customBrand: '#5A1E33', customButton: '#E07A8A', customPage: '#FBF4F3', customBase: key });
    assert.match(view.className, new RegExp(`^t-${DEFAULT_THEME} t-custom`), key);
  }
  for (const key of Object.keys(THEMES)) assert.equal(isThemeKey(key), true, key);
  assert.equal(isThemeKey(undefined), false);
  assert.equal(normalizeTheme('classic'), 'forest', 'a retired theme still maps to its successor');
});

test('the colours that read a theme directly, and the name, come from the same place for set and custom themes', () => {
  for (const [key, set] of Object.entries(THEMES)) {
    const view = themeView(key, {});
    assert.equal(view.className, `t-${key}`);
    assert.equal(view.style, undefined);
    assert.deepEqual([view.colors.primary, view.colors.accent, view.name], [set.primary, set.accent, set.name]);
  }
  const settings = { customBrand: '#5A1E33', customButton: '#E07A8A', customPage: '#FBF4F3', customBase: 'wine' };
  const custom = themeView(CUSTOM_THEME, settings);
  assert.equal(custom.key, CUSTOM_THEME);
  assert.equal(custom.name, 'Custom colours');
  assert.match(custom.className, /^t-wine t-custom/, 'the type and shapes come from the theme it started from');
  assert.equal(custom.style['--t-acc2'], '#5A1E33');
  assert.equal(custom.colors.primary, '#5A1E33');
  // Half a palette never reaches a buyer: the default theme instead.
  const half = themeView(CUSTOM_THEME, { customBrand: '#5A1E33' });
  assert.equal(half.key, DEFAULT_THEME);
  assert.equal(half.style, undefined);
  // A base that is not a theme falls back to the default theme's type.
  assert.equal(customThemeFrom({ ...settings, customBase: 'bogus' }).base, DEFAULT_THEME);
  // Stored as 'custom', read back as 'custom'.
  assert.equal(normalizeTheme(CUSTOM_THEME), CUSTOM_THEME);
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
});

for (const kind of backends()) {
  describe(`custom colours over the API (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'custom_theme');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Custom Colours' } })).body.id;
    });
    after(() => app.stop());

    const patch = (body) => api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body });

    test('the three colours and the theme they start from are saved as colour codes', async () => {
      assert.deepEqual(
        ['customBrand', 'customButton', 'customPage', 'customBase'].map((key) => DEFAULT_SETTINGS[key]),
        ['', '', '', ''],
        'a new community has none',
      );
      const res = await patch({ settings: { customBrand: '5a1e33', customButton: '#e07a8a', customPage: '#FBF4F3', customBase: 'wine' } });
      assert.equal(res.status, 200);
      assert.deepEqual(
        [res.body.settings.customBrand, res.body.settings.customButton, res.body.settings.customPage, res.body.settings.customBase],
        ['#5A1E33', '#E07A8A', '#FBF4F3', 'wine'],
      );
    });

    test('anything that is not a colour code, or a base that is not a theme, is refused and changes nothing', async () => {
      for (const settings of [{ customBrand: 'red' }, { customButton: '#12345' }, { customPage: 'url(x)' }, { customBase: 'bogus' }]) {
        const res = await patch({ settings });
        assert.equal(res.status, 400, JSON.stringify(settings));
      }
      assert.equal((await api(`/api/admin/communities/${cid}`, { token })).body.settings.customBrand, '#5A1E33');
      // Clearing one is allowed.
      assert.equal((await patch({ settings: { customBase: '' } })).status, 200);
      await patch({ settings: { customBase: 'wine' } });
    });

    test('custom colours can be chosen once all three are set, and buyers are sent them', async () => {
      const res = await patch({ theme: CUSTOM_THEME });
      assert.equal(res.status, 200);
      assert.equal(res.body.theme, CUSTOM_THEME);
      const buyer = (await api(`/api/c/${cid}`)).body;
      assert.equal(buyer.theme, CUSTOM_THEME);
      assert.equal(buyer.settings.customButton, '#E07A8A');
      // Back to a set theme keeps the colours for next time.
      await patch({ theme: 'navy' });
      assert.equal((await api(`/api/c/${cid}`)).body.settings.customBrand, '#5A1E33');
    });

    test('custom colours cannot be chosen while one of the three is missing, in the same request or before it', async () => {
      const other = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'No Colours Yet' } })).body.id;
      const bare = await api(`/api/admin/communities/${other}`, { method: 'PATCH', token, body: { theme: CUSTOM_THEME } });
      assert.equal(bare.status, 400);
      assert.notEqual((await api(`/api/admin/communities/${other}`, { token })).body.theme, CUSTOM_THEME);
      // Colours and the theme together in one request: allowed.
      const both = await api(`/api/admin/communities/${other}`, {
        method: 'PATCH',
        token,
        body: { theme: CUSTOM_THEME, settings: { customBrand: '#102A43', customButton: '#1E40AF', customPage: '#F7F9FC' } },
      });
      assert.equal(both.status, 200);
      assert.equal(both.body.theme, CUSTOM_THEME);
      // Clearing a colour while custom colours are in use is refused.
      const clear = await api(`/api/admin/communities/${other}`, { method: 'PATCH', token, body: { settings: { customButton: '' } } });
      assert.equal(clear.status, 400);
    });

    test('a base or a theme that is only a key every object inherits is refused, never stored', async () => {
      for (const customBase of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
        const res = await patch({ settings: { customBase } });
        assert.equal(res.status, 400, customBase);
      }
      assert.equal((await api(`/api/admin/communities/${cid}`, { token })).body.settings.customBase, 'wine');
      // A theme like that is ignored, as an unknown theme is.
      const before = (await api(`/api/admin/communities/${cid}`, { token })).body.theme;
      await patch({ theme: 'constructor' });
      assert.equal((await api(`/api/admin/communities/${cid}`, { token })).body.theme, before);
      const made = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Proto Theme', theme: 'toString' } });
      assert.equal(made.body.theme ?? (await api(`/api/admin/communities/${made.body.id}`, { token })).body.theme, DEFAULT_THEME);
    });

    test('Today names a community on its own colours "Custom colours", and is sent only the colour settings', async () => {
      assert.equal((await patch({ theme: CUSTOM_THEME })).status, 200);
      const today = (await api('/api/admin/today', { token })).body;
      const entry = today.communities.find((item) => item.id === cid);
      assert.ok(entry, 'listed');
      assert.deepEqual(Object.keys(entry.settings).sort(), [...CUSTOM_KEYS].sort(), 'the four colour settings, nothing else');
      assert.equal(entry.settings.customButton, '#E07A8A');
      assert.equal(themeView(entry.theme, entry.settings).name, 'Custom colours');
      // A community on a set theme is named by it, with blank colour settings beside it.
      await patch({ theme: 'navy' });
      const again = (await api('/api/admin/today', { token })).body.communities.find((item) => item.id === cid);
      assert.equal(themeView(again.theme, again.settings).name, THEMES.navy.name);
    });
  });
}

test("the PDF reports' title band takes a community's own colours", () => {
  const settings = { lenderName: 'Summit Home Loans', customBrand: '#2F4858', customButton: '#F7E9A0', customPage: '#FFFDF7', customBase: 'clay' };
  const community = { id: 'own', name: 'Own Colours', theme: CUSTOM_THEME, settings };
  const pdf = buildLeadsPdf({ community, leads: [], homes: [], now: new Date('2026-10-16T18:00:00Z'), timeZone: 'America/Denver' });
  const ops = readPdf(pdf.buffer)[0].ops;
  // The PDF writes a fill colour as three numbers 0 to 1, to two places.
  const fill = (hex) => `${[1, 3, 5].map((i) => Number((parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(2))).join(' ')} rg`;
  const colors = themeView(CUSTOM_THEME, settings).colors;
  assert.ok(ops.includes(fill(colors.primary)), `the brand colour ${colors.primary}`);
  assert.equal(colors.primary, '#2F4858');
  // Not the default theme's navy, which half a palette (or no palette) would give.
  assert.ok(!ops.includes(fill(THEMES[DEFAULT_THEME].primary)));
});
