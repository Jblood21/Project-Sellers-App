/**
 * The line icons Trailhead draws, at one stroke weight so they read as a set: 1.8px with round joins, the
 * weight the board's heart, menu and arrows are drawn at. Each is decoration beside a word or inside a named
 * control, so none of them says anything to a screen reader.
 */
const line = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

/** The save mark. Filled once the home is saved, so the state is in the shape as well as the colour. */
export function Heart({ size = 22, filled = false }) {
  return (
    <svg {...line} width={size} height={size} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7-4.4-9.2-8.8A5 5 0 0 1 12 6.5a5 5 0 0 1 9.2 4.7C19 15.6 12 20 12 20z" />
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

export function ChevronRight({ size = 18 }) {
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

/** The board's arrow on every "go on" button: Start, Continue, Next stop. */
export function ArrowRight({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeft({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

/** The tick on a done stop. Heavier than the rest, as the board draws it, so it reads at 12px. */
export function Check({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A key, for the end of the trail: keys in hand. */
export function Key({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8.5-8.5M16 7l3 3M13.5 9.5l2 2" />
    </svg>
  );
}

/** A calendar, beside Book a tour. */
export function Calendar({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

/** A speech bubble, beside Talk about financing. */
export function Chat({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M4 5h16v11H10l-5 4v-4H4z" />
    </svg>
  );
}

/** The board's small mark beside the development's name: a trail up a hill to a sunlit dot. */
export function TrailGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M5 21c1.5-4 7-3 7-8s5.5-4 6.5-9" />
      <circle cx="18.5" cy="4" r="2" fill="currentColor" stroke="none" className="th-glyph__sun" />
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

/** A house, for the empty list and a home with no photo yet. */
export function HouseGlyph({ size = 28 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />
    </svg>
  );
}
