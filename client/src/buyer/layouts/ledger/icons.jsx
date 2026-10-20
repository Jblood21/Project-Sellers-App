/**
 * The line icons Ledger draws, at one stroke weight so they read as a set: 1.75px with round joins, the
 * weight the board's heart, menu and rail are drawn at. Each sits beside a word or inside a named control,
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

/** The save mark. Filled once something is saved, so the state is in the shape as well as the colour. */
export function Heart({ size = 20, filled = false }) {
  return (
    <svg {...line} width={size} height={size} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 21s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12C19 16.6 12 21 12 21z" />
    </svg>
  );
}

export function ChevronLeft({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRight({ size = 16 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <path d="M9 6l6 6-6 6" />
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

/** The rail's five: the dashboard as four tiles of different sizes, as the screen itself is built. */
export function DashGlyph({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z" />
    </svg>
  );
}

export function HouseGlyph({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" />
    </svg>
  );
}

/** Two sliders, for the tools: each one is a few figures a buyer moves until the answer fits. */
export function SliderGlyph({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" />
    </svg>
  );
}

/** An open book, for the guides. */
export function BookGlyph({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" />
    </svg>
  );
}

/** A ticked list, for the plan. */
export function ListGlyph({ size = 20 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
    </svg>
  );
}

/** A pin, for the places near the community. */
export function PinGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M12 21s7-6 7-11.5A7 7 0 0 0 5 9.5C5 15 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/** A folded map, for the site map. */
export function MapGlyph({ size = 22 }) {
  return (
    <svg {...line} width={size} height={size}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
    </svg>
  );
}

/** The mark a tool carries once it is in the plan, inside a circle so it reads as done at a glance. */
export function DoneGlyph({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.8" />
    </svg>
  );
}

/** The empty circle a tool not yet in the plan carries. */
export function OpenGlyph({ size = 18 }) {
  return (
    <svg {...line} width={size} height={size} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
