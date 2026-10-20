/**
 * The few line icons Marketplace draws, at one stroke weight so they read as a set: 2px, round caps,
 * the way a search site's controls are drawn. Each is decoration beside a word or inside a named
 * control, so none of them says anything to a screen reader.
 */
const line = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

/** The save mark. Filled once the home is saved, so the state is in the shape as well as the colour. */
export function Heart({ size = 22, filled = false }) {
  return (
    <svg {...line} width={size} height={size} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
    </svg>
  );
}

export function ChevronLeft({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function MenuLines({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** A pin, for the places near the community. */
export function PinGlyph({ size = 24 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M12 21s7-6 7-11.5A7 7 0 0 0 5 9.5C5 15 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/** A folded map, for the site map. */
export function MapGlyph({ size = 24 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
    </svg>
  );
}

/** A house, for the empty states of the list and a home with no photo yet. */
export function HouseGlyph({ size = 28 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />
    </svg>
  );
}
