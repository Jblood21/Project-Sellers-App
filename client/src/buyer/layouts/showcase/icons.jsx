/**
 * The few line icons Showcase draws, at one stroke weight so they read as a set: 1.75px with round joins,
 * the weight the board's tab bar is drawn at. Each is decoration beside a word or inside a named control,
 * so none of them says anything to a screen reader.
 */
const line = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
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
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
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

/** The sheet's close mark. */
export function Cross({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Homes, in the tab bar. */
export function HouseGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5" />
    </svg>
  );
}

/** My numbers: a calculator. */
export function CalcGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01" />
    </svg>
  );
}

/** My plan: a ticked list. */
export function ListGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="m4 6.5 1.5 1.5L8 5.5M4 12.5 5.5 14 8 11.5M4.5 18.5h2M11 7h9M11 13h9M11 19h9" />
    </svg>
  );
}

/** Learn: an open book. */
export function BookGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M12 6.5C10.3 5.2 7.8 4.5 4 4.5V18c3.8 0 6.3.7 8 2 1.7-1.3 4.2-2 8-2V4.5c-3.8 0-6.3.7-8 2zM12 6.5V20" />
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
