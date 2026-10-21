/**
 * The maths behind the colour wheel in Setup's "Your own colours".
 *
 * A colour is three parts here, the way the wheel draws it:
 *   h  the hue, 0 to 360, read round the wheel: red at the top, then yellow, green, cyan, blue and magenta
 *      going clockwise, which is the order the CSS conic-gradient paints them in
 *   s  the strength, 0 to 1, read outward: white at the centre, the full colour at the rim
 *   v  how light or dark, 0 to 1: the "Lighter or darker" slider
 *
 * No imports, so the tests can run it in Node as well as the browser. Colour codes go in and come out as
 * '#RRGGBB' in capitals, the form the server stores.
 */

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function hexToRgb(hex) {
  const text = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(text.slice(i, i + 2), 16));
}

export function rgbToHex(rgb) {
  return `#${rgb.map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** A colour code as hue, strength and lightness. Grey has no hue of its own, so it reads as 0 (red). */
export function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((part) => part / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  let h = 0;
  if (spread) {
    if (max === r) h = ((g - b) / spread) % 6;
    else if (max === g) h = (b - r) / spread + 2;
    else h = (r - g) / spread + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? spread / max : 0, v: max };
}

export function hsvToHex({ h, s, v }) {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  const [r, g, b] = [
    [chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x],
  ][Math.min(5, Math.floor(hue / 60))];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/**
 * Where a point on the wheel lands, given its distance from the centre (dx right, dy down) and the wheel's
 * radius. A point dragged past the rim keeps its direction and stays at full strength.
 */
export function pointToHueStrength(dx, dy, radius) {
  const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const s = radius > 0 ? clamp(Math.hypot(dx, dy) / radius, 0, 1) : 0;
  return { h, s };
}

/** The other way: where on the wheel to draw the marker, as a share of the radius from the centre. */
export function hueStrengthToPoint(h, s) {
  const angle = (h * Math.PI) / 180;
  return { x: s * Math.sin(angle), y: -s * Math.cos(angle) };
}

// A colour too dark to show on the wheel is lifted to this when the wheel is clicked, or the click would
// seem to do nothing (the wheel is drawn under a black veil as dark as the colour is).
export const WHEEL_MIN_LIGHT = 0.35;

/**
 * The wheel answers the arrow keys too, so it is not a mouse-only control: left and right go round the
 * wheel, up and down make the colour stronger or softer, and Shift takes bigger steps. Anything else is
 * not the wheel's to handle (null), so Tab still leaves it.
 */
export function stepWheel(hsv, key, big = false) {
  const turn = big ? 30 : 5;
  const push = big ? 0.2 : 0.05;
  if (key === 'ArrowRight') return { ...hsv, h: (hsv.h + turn) % 360 };
  if (key === 'ArrowLeft') return { ...hsv, h: (hsv.h - turn + 360) % 360 };
  if (key === 'ArrowUp') return { ...hsv, s: clamp(hsv.s + push, 0, 1) };
  if (key === 'ArrowDown') return { ...hsv, s: clamp(hsv.s - push, 0, 1) };
  return null;
}

/** `share` of colour a, the rest b. */
function blend(a, b, share) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((part, i) => part * share + y[i] * (1 - share)));
}

/**
 * "Goes well with": the colours a designer would reach for next to this one. Three from round the wheel
 * (straight across it, and a step either side) at the same strength and lightness, and the colour itself
 * mixed toward white and toward black, which change it even when it is already as light or dark as the
 * slider goes.
 */
export function goesWellWith(hsv) {
  const own = hsvToHex(hsv);
  const turn = (by) => hsvToHex({ ...hsv, h: (hsv.h + by + 360) % 360 });
  return [
    { key: 'opposite', label: 'Opposite', hex: turn(180) },
    { key: 'next', label: 'Next to it', hex: turn(30) },
    { key: 'other', label: 'Next to it, other side', hex: turn(-30) },
    { key: 'lighter', label: 'Lighter', hex: blend(own, '#FFFFFF', 0.6) },
    { key: 'darker', label: 'Darker', hex: blend(own, '#000000', 0.6) },
  ];
}
