import { CUSTOM_THEME, DEFAULT_THEME, THEMES, isThemeKey, normalizeTheme } from './domain.js';

/**
 * A community's own colours: three a builder picks (the brand colour for the header, footer and dark
 * grounds; the button colour for buttons, links and highlights; the page colour behind everything) and
 * a theme to take the type and shapes from. Everything else a theme carries (the text, the muted text,
 * the text-safe accent, the tints, the lines, the text on each fill) is worked out here, and every pair
 * is checked the way base.css checks the set themes: text 4.5:1 or better against each ground it sits
 * on. A colour that cannot meet that is moved until it does, and the move is reported, so Setup can say
 * what it changed and why instead of quietly drawing something other than what was picked.
 *
 * Stored as four settings (customBrand, customButton, customPage, customBase) with the community's theme
 * set to 'custom'. Incomplete settings never reach a buyer as half a palette: themeView falls back to the
 * default theme until all three colours are there.
 */

export const CUSTOM_KEYS = ['customBrand', 'customButton', 'customPage', 'customBase'];
export const CUSTOM_THEME_NAME = 'Custom colours';

const HEX_RE = /^#[0-9a-f]{6}$/i;
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const NEAR_BLACK = '#141414';

/** '#5a1e33' and '5A1E33' are the same colour; anything else (a name, three digits, rgb()) is not one. */
export function normalizeHex(value) {
  const text = String(value ?? '').trim();
  const withHash = text.startsWith('#') ? text : `#${text}`;
  return HEX_RE.test(withHash) ? withHash.toUpperCase() : null;
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Relative luminance (WCAG 2). */
export function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `share` of a, the rest b. */
export function mix(a, b, share) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return toHex(x.map((v, i) => v * share + y[i] * (1 - share)));
}

/** The colour moved a step at a time toward `toward` until `ok` holds (or it can move no further). */
function nudge(color, toward, ok, step = 0.08) {
  let out = color;
  for (let i = 0; i < 60 && !ok(out); i += 1) {
    const next = mix(out, toward, 1 - step);
    if (next === out) break;
    out = next;
  }
  return out;
}

const ratioText = (ratio) => `${ratio.toFixed(1)} to 1`;

/**
 * The full set of buyer-app colour tokens for three picked colours, with what had to change.
 *
 *   page    kept light (luminance 0.7 or more): every layout draws dark text on its page
 *   brand   darkened until white text on it clears 4.5:1, AND it clears 4.5:1 as text on the page, the cards
 *           and both tints: every layout writes light text on its dark grounds, and several also write words in
 *           the brand colour on the page (Trailhead's footer links and phone number, the outline buttons in
 *           Ledger and Red Rock, Salt Grass's titles)
 *   button  white text on it if that clears 4.5:1, else near-black if that does, else darkened until white does
 *   accT    the button colour as text: darkened until it clears 4.5:1 on the page, the cards and the tint
 *   mut     the muted text: 4.5:1 or better on the page, the cards and both tints
 *
 * `fixes` lists each colour that was moved, in words Setup shows, each with the `checks` it was moved for;
 * `checks` the pairs a builder cares about, each with its ratio. `weakAccentOnDark` is true when the button
 * colour does not show on the brand colour (under 3:1, against the brand colour itself or against the faint
 * white track a layout draws on it), which a layout that draws the accent on its dark grounds reads as the
 * class t-acc-weak.
 */
export function deriveTheme({ brand, button, page }) {
  const picked = { brand: normalizeHex(brand), button: normalizeHex(button), page: normalizeHex(page) };
  if (!picked.brand || !picked.button || !picked.page) return null;
  const fixes = {};

  const bg = nudge(picked.page, WHITE, (c) => luminance(c) >= 0.7);
  if (bg !== picked.page) {
    fixes.page = { key: 'page', title: 'Page colour', detail: `Lightened to ${bg} so dark text on it stays easy to read.`, checks: ['text'] };
  }
  const sur = WHITE;

  // The text: near-black with a little of the brand in it, as the set themes tint their ink.
  let ink = mix(NEAR_BLACK, picked.brand, 0.85);
  if (contrast(ink, bg) < 7 || contrast(ink, sur) < 7) ink = NEAR_BLACK;

  let acc = picked.button;
  let onacc;
  if (contrast(WHITE, acc) >= 4.5) {
    onacc = WHITE;
  } else if (contrast(ink, acc) >= 4.5) {
    onacc = ink;
    fixes.button = {
      key: 'button',
      title: 'Words on buttons',
      detail: `Dark words on your buttons: white on this colour is only ${ratioText(contrast(WHITE, acc))}.`,
      checks: ['button'],
    };
  } else {
    acc = nudge(acc, BLACK, (c) => contrast(WHITE, c) >= 4.5);
    onacc = WHITE;
    fixes.button = { key: 'button', title: 'Button colour', detail: `Darkened to ${acc} so the words on buttons stay easy to read.`, checks: ['button'] };
  }
  const tint = mix(acc, WHITE, 0.1);

  // The brand colour, first for the white words on it, then (if that is not yet enough) for the words written
  // in it on the light grounds. The cards are white, so the first already covers them; the page, the accent's
  // tint and the brand's own faint tint (which darkens along with it) may need more. Each step is the same
  // walk toward black, so the two together end where one walk for both would.
  const brandTint = (c) => mix(c, WHITE, 0.07);
  const asText = (c) => Math.min(contrast(c, bg), contrast(c, sur), contrast(c, tint), contrast(c, brandTint(c)));
  const forWhite = nudge(picked.brand, BLACK, (c) => contrast(WHITE, c) >= 4.5);
  const acc2 = nudge(forWhite, BLACK, (c) => asText(c) >= 4.5);
  if (acc2 !== picked.brand) {
    const why = [];
    if (forWhite !== picked.brand) why.push('header');
    if (acc2 !== forWhite) why.push('brandText');
    const reason = why.length === 2
      ? 'so white words on it, and words in it on the page, stay easy to read'
      : why[0] === 'header' ? 'so white words on it stay easy to read' : 'so words in your brand colour stay easy to read on the page';
    fixes.brand = { key: 'brand', title: 'Brand colour', detail: `Darkened to ${acc2} ${reason}.`, checks: why };
  }
  const onacc2 = WHITE;
  const tint2 = brandTint(acc2);

  const accT = nudge(acc, BLACK, (c) => Math.min(contrast(c, bg), contrast(c, sur), contrast(c, tint)) >= 4.5);
  if (accT !== acc) {
    fixes.accT = { key: 'accT', title: 'Links and labels', detail: `A darker shade of your button colour, ${accT}, so links can be read on the page.`, checks: ['links'] };
  }
  const mut = nudge(mix(ink, bg, 0.62), ink, (c) => Math.min(contrast(c, bg), contrast(c, sur), contrast(c, tint), contrast(c, tint2)) >= 4.6, 0.12);
  const [ir, ig, ib] = rgbOf(ink);
  const line = `rgba(${ir}, ${ig}, ${ib}, 0.14)`;
  const standOut = contrast(acc, bg);
  // Kept in the order Setup lists them: the page first, then the brand colour, the buttons, the links.
  const fixList = ['page', 'brand', 'button', 'accT'].map((key) => fixes[key]).filter(Boolean);

  const checks = [
    { key: 'text', title: 'Words on the page', ratio: contrast(ink, bg) },
    { key: 'header', title: 'Words on the header and footer', ratio: contrast(onacc2, acc2) },
    { key: 'brandText', title: 'Words in your brand colour', ratio: asText(acc2) },
    { key: 'button', title: 'Words on buttons', ratio: contrast(onacc, acc) },
    { key: 'links', title: 'Links and labels', ratio: Math.min(contrast(accT, bg), contrast(accT, sur)) },
    { key: 'muted', title: 'Smaller, softer text', ratio: Math.min(contrast(mut, bg), contrast(mut, sur)) },
  ].map((check) => ({ ...check, text: ratioText(check.ratio), fixed: fixList.some((fix) => fix.checks.includes(check.key)) }));

  return {
    vars: {
      '--t-bg': bg, '--t-sur': sur, '--t-ink': ink, '--t-mut': mut,
      '--t-acc': acc, '--t-accT': accT, '--t-acc2': acc2,
      '--t-onacc': onacc, '--t-onacc2': onacc2,
      '--t-line': line, '--t-tint': tint, '--t-tint2': tint2,
    },
    // The five a set theme is defined by, for what reads a theme's colours directly (the PDF reports, the
    // phone's status bar, the swatches).
    colors: { primary: acc2, secondary: mix(acc2, WHITE, 0.8), accent: acc, background: bg, text: ink },
    fixes: fixList,
    checks,
    // Whether the button colour can carry meaning on the brand colour; under 3:1 it cannot. Ledger draws its
    // gauges in the button colour on a track of white at 20% over the brand colour, so the track counts too:
    // a button colour that clears the brand colour but not the track would leave the gauge fill unseen.
    weakAccentOnDark: contrast(acc, acc2) < 3 || contrast(acc, mix(onacc2, acc2, 0.2)) < 3,
    // Under 3:1 against the page a button still needs an edge to be seen as one.
    buttonNeedsEdge: standOut < 3,
  };
}

/** The custom palette a community's settings describe, or null until all three colours are set. */
export function customThemeFrom(settings) {
  const derived = deriveTheme({
    brand: settings?.customBrand, button: settings?.customButton, page: settings?.customPage,
  });
  if (!derived) return null;
  const base = isThemeKey(settings?.customBase) ? settings.customBase : DEFAULT_THEME;
  return { ...derived, base };
}

/**
 * Everything a screen needs to wear a community's theme: the classes for the buyer app's root, the inline
 * colour variables when the colours are the community's own, the five colours for what reads them directly,
 * and the name Setup and Today show. One function, so the buyer app, the previews, the PDFs and the admin
 * cannot disagree about what a theme looks like.
 */
export function themeView(theme, settings) {
  if (theme === CUSTOM_THEME) {
    const custom = customThemeFrom(settings);
    if (custom) {
      return {
        key: CUSTOM_THEME,
        name: CUSTOM_THEME_NAME,
        className: `t-${custom.base} t-custom${custom.weakAccentOnDark ? ' t-acc-weak' : ''}${custom.buttonNeedsEdge ? ' t-acc-edge' : ''}`,
        style: custom.vars,
        colors: custom.colors,
        custom,
      };
    }
  }
  const key = theme === CUSTOM_THEME ? DEFAULT_THEME : normalizeTheme(theme);
  const set = THEMES[key];
  return {
    key,
    name: set.name,
    className: `t-${key}`,
    style: undefined,
    colors: { primary: set.primary, secondary: set.secondary, accent: set.accent, background: set.background, text: set.text },
    custom: null,
  };
}
