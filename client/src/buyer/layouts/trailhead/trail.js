import { useSyncExternalStore } from 'react';

/** The overlook's key. It is not a tool's, so it can never be taken for one. */
export const OVERLOOK = 'homes';

/** From this width the trail is a column of its own beside the page, as the board's computer view draws it. */
export const WIDE = '(min-width: 900px)';

/**
 * The trail, built from the home screen's model (useHomeModel) so the header, its strip and the home screen
 * count the same stops in the same order: the community's tools as the other layouts list them (the two lead
 * questions, then the rest), with "Pick your home" just before My Move-In Plan, or last when that tool is off.
 * There is no overlook without homes to look at.
 *
 * A tool is done once its answer is in the buyer's plan; the overlook once they have saved a home. The
 * CURRENT stop is the first one not done, which need not follow the last done one: a buyer who answered the
 * third question first is still sent back to the first. With every stop done there is no current stop.
 */
export function trailOf(model) {
  const tools = [...model.leadTools, ...model.otherTools];
  const stops = tools.map((tool) => ({ key: tool.k, tool, name: tool.name, q: tool.q, done: model.inPlan(tool.k) }));
  if (model.homes.length) {
    const overlook = {
      key: OVERLOOK,
      tool: null,
      name: 'Pick your home',
      q: 'Which home is right for me?',
      done: model.savedCount > 0,
    };
    const moveIn = stops.findIndex((stop) => stop.key === 'movein');
    stops.splice(moveIn === -1 ? stops.length : moveIn, 0, overlook);
  }
  const numbered = stops.map((stop, i) => ({ ...stop, n: i + 1 }));
  const current = numbered.find((stop) => !stop.done) ?? null;
  return {
    stops: numbered,
    total: numbered.length,
    done: numbered.filter((stop) => stop.done).length,
    current,
    after: (stop) => (stop ? numbered[stop.n] ?? null : null),
    before: (stop) => (stop && stop.n > 1 ? numbered[stop.n - 2] : null),
    find: (key) => numbered.find((stop) => stop.key === key) ?? null,
  };
}

/**
 * Where a stop goes, as a link's props: a tool's own screen, told to come back to the trail when its answer
 * is saved (the state every other way into a tool passes), or Explore Homes for the overlook. A plain click
 * on the overlook goes through the model, which records the visit the way every other way into Explore Homes
 * does; a click that opens a new tab keeps the link.
 */
export function stopLink(stop, model) {
  const base = `/c/${model.communityId}`;
  if (stop.key === OVERLOOK) {
    return {
      to: model.paths.explore,
      onClick: (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        model.openExplore();
      },
    };
  }
  return { to: `${base}/tool/${stop.key}`, state: { from: model.paths.tools } };
}

/**
 * What a stop's state is called, in words: the marks are never the only way to read it. These are the words
 * shown beside the stop and the words its link is named with, the same in both, so a buyer who steers by voice
 * can say what they see ("You are here") and be understood.
 */
export function stateWords(stop, trail, { savedCount = 0 } = {}) {
  if (stop.done) return stop.key === OVERLOOK ? `${savedCount} saved` : 'In your plan';
  if (trail.current && trail.current.key === stop.key) return 'You are here';
  return '';
}

/**
 * Where each stop sits on a phone: two to a row, the rows snaking left to right and back, as the board lays
 * them out. The current stop (opened into a card) and the overlook (which carries its row of homes) take a
 * row of their own, and the trail runs on down the same side after them, so it never has to cut across a
 * card. Returns, by stop key, the grid row, the side (0 left, 1 right) and whether it spans the row; and the
 * side the end of the trail sits on.
 */
export function placeStops(stops, currentKey) {
  const places = {};
  let row = 1;
  let slot = 0;
  let side = 0;
  let last = 0;
  for (const stop of stops) {
    const full = stop.key === currentKey || stop.key === OVERLOOK;
    if (full) {
      if (slot === 1) {
        row += 1;
        slot = 0;
      }
      places[stop.key] = { row, side: last, full: true };
      row += 1;
      side = last;
      continue;
    }
    places[stop.key] = { row, side, full: false };
    last = side;
    if (slot === 0) {
      slot = 1;
      side = 1 - side;
    } else {
      row += 1;
      slot = 0;
    }
  }
  return { places, endSide: side };
}

/**
 * The trail's line, through the centre of every marker in order. Along a row it is a gentle wave; down one
 * side it bows outward like a switchback (on a phone toward the nearer edge, in the narrow column of a wide
 * screen from side to side); across from one side to the other it is an S. The part already walked is solid,
 * up to the current stop; the rest is dotted. Returned as path data: the whole line (drawn faint and wide
 * underneath, as the board's trail bed), the walked part, the part to come, and where the trail starts.
 */
export function trailLine(marks, width, wide) {
  if (!marks.length) return null;
  const first = marks[0];
  const start = wide ? { x: first.x, y: first.y - 30 } : { x: Math.min(14, first.x), y: first.y };
  const points = [start, ...marks];
  const round = (value) => Math.round(value * 10) / 10;
  const segs = [];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i - 1];
    const q = points[i];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    let c1;
    let c2;
    if (Math.abs(dy) < 16) {
      const wave = Math.min(9, Math.abs(dx) / 8) * (i % 2 ? 1 : -1);
      c1 = [p.x + dx / 3, p.y + wave];
      c2 = [p.x + (2 * dx) / 3, q.y - wave];
    } else if (Math.abs(dx) < 24) {
      const out = wide
        ? (i % 2 ? 9 : -9)
        : (p.x > width / 2 ? 1 : -1) * Math.max(0, Math.min(64, (p.x > width / 2 ? width - p.x : p.x) - 10));
      c1 = [p.x + out, p.y + dy * 0.35];
      c2 = [q.x + out, q.y - dy * 0.35];
    } else {
      c1 = [p.x, p.y + dy * 0.55];
      c2 = [q.x, q.y - dy * 0.55];
    }
    segs.push(`C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(q.x)} ${round(q.y)}`);
  }
  const move = (point) => `M${round(point.x)} ${round(point.y)}`;
  const at = marks.findIndex((mark) => mark.current);
  // Segment i runs from points[i] to points[i + 1]; the current marker is points[at + 1].
  const walked = at === -1 ? segs.length : at + 1;
  return {
    start,
    bed: `${move(start)} ${segs.join(' ')}`,
    done: walked ? `${move(start)} ${segs.slice(0, walked).join(' ')}` : '',
    todo: walked < segs.length ? `${move(points[walked])} ${segs.slice(walked).join(' ')}` : '',
  };
}

/** True while the media query matches, re-rendering when it changes. */
export function useMedia(query) {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/**
 * Book a tour, asked for from the home screen. The home screen is not handed the header's onTalk (the same
 * call every other Book a tour makes: it records the ask, then opens the agents or the sales team's sheet),
 * so it sends this event up the page and the header, which holds onTalk, answers it.
 */
export const TOUR_EVENT = 'trailhead:tour';
