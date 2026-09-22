const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const ChevronLeft = ({ size = 16 }) => (
  <svg {...base} width={size} height={size}><path d="M15 18l-6-6 6-6" /></svg>
);

export const Menu = ({ size = 17 }) => (
  <svg {...base} width={size} height={size}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);

export const Star = ({ size = 20, filled = false }) => (
  <svg {...base} width={size} height={size} fill={filled ? 'currentColor' : 'none'}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const Check = ({ size = 13 }) => (
  <svg {...base} width={size} height={size} strokeWidth={3.5}><path d="M20 6L9 17l-5-5" /></svg>
);

export const ArrowUp = ({ size = 16 }) => (
  <svg {...base} width={size} height={size}><path d="M12 3v12M6 9l6-6 6 6" /><path d="M4 21h16" /></svg>
);

export const Pencil = ({ size = 16 }) => (
  <svg {...base} width={size} height={size}><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);

export const QrIcon = ({ size = 18 }) => (
  <svg {...base} width={size} height={size}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M21 21v.01M17.5 17.5h.01" />
  </svg>
);

export const Pin = ({ size = 14 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 22s7-6.13 7-11a7 7 0 1 0-14 0c0 4.87 7 11 7 11z" />
    <circle cx="12" cy="11" r="2.5" />
  </svg>
);

export const Trash = ({ size = 15 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);
