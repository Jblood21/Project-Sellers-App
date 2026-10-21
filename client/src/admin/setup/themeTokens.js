import { contrast, normalizeHex, themeView } from '@shared/customTheme.js';
import { THEMES } from '@shared/domain.js';

/**
 * The colours a set theme really paints the buyer app with, read from base.css itself.
 *
 * THEMES in shared/domain.js keeps the five colours each palette was designed from, but base.css is what the
 * buyer app wears, and for a few themes the two differ on purpose (Modern Blue & White's buttons are its
 * blue, not the sky its accent was drawn with). The studio's dots, "Start from" and the readability line
 * all want what a buyer will see, so they read the stylesheet: an element wearing the theme's own classes
 * (from themeView, as the buyer app does) and its computed --t-* values. Nothing to keep in step by hand.
 */

const TOKENS = ['bg', 'sur', 'ink', 'mut', 'acc', 'accT', 'acc2', 'onacc', 'onacc2'];
const cache = new Map();

export function themeTokens(key) {
  if (cache.has(key)) return cache.get(key);
  const probe = document.createElement('span');
  probe.className = themeView(key).className;
  probe.hidden = true;
  document.body.append(probe);
  const style = window.getComputedStyle(probe);
  const tokens = Object.fromEntries(TOKENS.map((name) => [name, normalizeHex(style.getPropertyValue(`--t-${name}`))]));
  probe.remove();
  // Kept only once the stylesheet has answered; a read made before it loaded is tried again next time.
  if (TOKENS.every((name) => tokens[name])) cache.set(key, tokens);
  return tokens;
}

/** The three colours "Your own colours" asks for, as a set theme has them. */
export function themeColours(key) {
  const tokens = themeTokens(key);
  // Should the stylesheet not have answered, the theme's own design colours are near enough to start from.
  const theme = THEMES[key];
  return { brand: tokens.acc2 ?? theme.primary, button: tokens.acc ?? theme.accent, page: tokens.bg ?? theme.background };
}

/**
 * The lowest of the same six checks deriveTheme makes for a builder's own colours (words on the page, on the
 * header, in the brand colour, on buttons, links, the softer text), so a set theme and your own colours are
 * measured the same way. These are the theme's own pairs; where a layout lays a colour on a ground of its own
 * (a tint behind muted text, say), its stylesheet keeps that pair at 4.5:1 for every theme. Null if the
 * stylesheet has not answered yet.
 */
export function lowestRatio(key) {
  const t = themeTokens(key);
  if (!TOKENS.every((name) => t[name])) return null;
  return Math.min(
    contrast(t.ink, t.bg),
    contrast(t.onacc2, t.acc2),
    contrast(t.acc2, t.bg), contrast(t.acc2, t.sur),
    contrast(t.onacc, t.acc),
    contrast(t.accT, t.bg), contrast(t.accT, t.sur),
    contrast(t.mut, t.bg), contrast(t.mut, t.sur),
  );
}
