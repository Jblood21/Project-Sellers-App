/** Small line icons for the side menu and the bottom bar. Decorative: every one sits beside its word. */
const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false',
};

const PATHS = {
  today: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  leads: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.4-3.4 3-5.4 6-5.4s5.6 2 6 5.4" /><path d="M16.5 5a3 3 0 0 1 0 6" /><path d="M18 14.8c1.7.7 2.8 2.3 3 4.7" /></>,
  stats: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  homes: <><path d="M4 20V9.5L12 4l8 5.5V20z" /><path d="M9.5 20v-6h5v6" /></>,
  area: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  learn: <><path d="M4 5.5C6.7 4.5 9.5 4.6 12 6c2.5-1.4 5.3-1.5 8-.5V19c-2.7-1-5.5-.9-8 .5-2.5-1.4-5.3-1.5-8-.5z" /><path d="M12 6v13.5" /></>,
  times: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  tools: <><path d="M14.5 6.5a4 4 0 0 0 4.9 4.9l-9 9a2.1 2.1 0 0 1-3-3z" /><path d="M14.5 6.5 17 4l3 3-2.5 2.5" /></>,
  setup: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  switch: <><path d="M7 4 3.5 7.5 7 11" /><path d="M3.5 7.5H15" /><path d="M17 13l3.5 3.5L17 20" /><path d="M20.5 16.5H9" /></>,
  open: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  signout: <><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12 20 3" /><path d="M16 7l2.5 2.5" /><path d="M13 10l2.5 2.5" /></>,
  team: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.3-3.2 2.7-5.2 5.5-5.2s5.2 2 5.5 5.2" /><circle cx="16.5" cy="9.5" r="2.6" /><path d="M15.5 14.6c2.6.2 4.6 2 5 4.9" /></>,
  // A clock with its hand turning back: the activity log, what the team changed and when.
  activity: <><path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5 9.2 9.2 0 0 0-6.4 2.6L3.5 8.3" /><path d="M3.5 3.5v4.8h4.8" /><path d="M12 7.5V12l3 2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  edit: <><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M21 21v.01M17.5 17.5h.01" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
};

export default function NavIcon({ name, size = 20 }) {
  return <svg {...base} width={size} height={size}>{PATHS[name] ?? null}</svg>;
}
