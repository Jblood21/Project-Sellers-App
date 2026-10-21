import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { customThemeFrom, deriveTheme, themeView } from '@shared/customTheme.js';
import { CUSTOM_THEME, DEFAULT_THEME, LAYOUTS, THEMES, isThemeKey, normalizeLayout } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { PREVIEW_MESSAGE, previewMessage, previewPath } from '../../lib/themePreview.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote } from '../ui.jsx';
import OwnColours, { CheckIcon, ReadabilityCheck } from './OwnColours.jsx';
import { lowestRatio, themeColours } from './themeTokens.js';

// The two screens the preview draws the buyer app on, at their real size; each is scaled down to fit.
const SCREENS = {
  phone: { w: 390, h: 844, title: 'Preview of the buyer app on a phone' },
  computer: { w: 1280, h: 800, title: 'Preview of the buyer app on a computer' },
};
const VIEWS = [
  { key: 'phone', label: 'Phone' },
  { key: 'computer', label: 'Computer' },
  { key: 'both', label: 'Both' },
];
// Under this width (the studio's own) the list sits above the preview rather than beside it.
const WIDE_STUDIO = 760;
// On a phone (the admin's own phone width, as admin-extras.css has it) only the phone is shown: a computer
// screen scaled into a phone-width column is too small to judge anything by. A tablet or a small laptop keeps
// the Phone / Computer / Both switch, and Computer there takes the whole width of the stage.
const PHONE_WINDOW = '(max-width: 559px)';
// Until the builder picks one, the preview shows both screens when the stage has room to draw them at a size
// worth looking at (the computer about 460 pixels wide), and the phone alone when it does not.
const BOTH_ROOM = 700;
const FRAME_GAP = 24;

// Side by side, the phone is scaled this much more than the computer, which draws it 1.6 times as tall, as
// board C has them: a phone you can read beside a computer screen you can take in at a glance.
const PHONE_OVER_COMPUTER = 1.52;

/**
 * How big to draw each screen in a stage `room` pixels wide. One alone is drawn as large as the stage
 * allows (up to about 600 pixels tall). Both share the width side by side, and the computer drops under the
 * phone only when beside it would be too small to read.
 */
function fitScreens(room, view) {
  const { phone: p, computer: c } = SCREENS;
  if (view === 'phone') return { phone: Math.min(room / p.w, 600 / p.h) };
  if (view === 'computer') return { computer: Math.min(room / c.w, 600 / c.h) };
  const computer = Math.min((room - FRAME_GAP) / (p.w * PHONE_OVER_COMPUTER + c.w), 480 / c.h);
  if (computer >= 0.22) return { phone: Math.min(computer * PHONE_OVER_COMPUTER, 480 / p.h), computer };
  return { phone: Math.min(room / p.w, 480 / p.h), computer: Math.min(room / c.w, 0.45) };
}

/**
 * An element's width, kept up to date as the window or the page around it changes. Returns the width and the
 * ref to put on the element: a callback, so an element that is drawn somewhere else (the stage moves beside the
 * wheel on a phone) is measured again rather than its old, detached self.
 */
function useWidth(inner = false) {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padding = inner ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
      setWidth(Math.max(0, el.clientWidth - padding));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, inner]);
  return [width, setEl];
}

/** Whether a media query matches, kept up to date. */
function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** What the community has saved as its own colours, or (until it has some) its current theme's. */
function startingColours(community, inUseKey) {
  const settings = community.settings ?? {};
  const saved = customThemeFrom(settings);
  if (saved) {
    return { brand: settings.customBrand, button: settings.customButton, page: settings.customPage, base: saved.base };
  }
  const base = THEMES[inUseKey] ? inUseKey : DEFAULT_THEME;
  return { ...themeColours(base), base };
}

const sameColours = (a, b) => ['brand', 'button', 'page', 'base'].every((key) => String(a[key]).toUpperCase() === String(b[key]).toUpperCase());

/**
 * Setup → Look & feel → the buyer app's colours, as a try-on studio (board C).
 *
 * The list on the left is the twelve themes and "Your own colours". Picking one only TRIES it on: the
 * preview on the right is the community's real buyer app, in its real layout and with its real homes,
 * drawn in frames the size of a phone and of a computer, and it repaints the moment a theme is tried on
 * or a colour is moved, because the studio tells the frames what to wear with a message rather than
 * reloading them (client/src/lib/themePreview.js). Nothing reaches buyers until "Use …" is pressed, and
 * the studio says so beside it; "Keep …" goes back to what buyers see now.
 *
 * Every name and class here comes from themeView, the one function the buyer app, the PDFs and Today use
 * too, so the studio cannot show a theme differently from how a buyer will get it.
 */
export default function ThemeStudio({ community, reload }) {
  const { token } = useAdmin();
  const inUse = themeView(community.theme, community.settings);
  const layout = normalizeLayout(community.layout);
  const layoutName = LAYOUTS.find((item) => item.k === layout)?.name ?? layout;

  const [trying, setTrying] = useState(inUse.key);
  // Your own colours, being worked on. Kept while other themes are tried, so coming back finds them as left.
  const [colours, setColours] = useState(() => startingColours(community, inUse.key));
  // While Your own colours is tried on, the list makes way for the colour tools; "All themes" brings it back.
  const [browsing, setBrowsing] = useState(false);
  // Phone, Computer or Both, once the builder picks one; until then, whichever the stage has room for.
  const [view, setView] = useState(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const [studioWidth, rootRef] = useWidth(true);
  const [room, stageRef] = useWidth(true);
  const wide = studioWidth >= WIDE_STUDIO;
  const phone = useMedia(PHONE_WINDOW);
  const chosen = view ?? (room >= BOTH_ROOM ? 'both' : 'phone');
  const shown = phone ? 'phone' : chosen;
  const scales = fitScreens(room || 300, shown);

  const customSettings = {
    customBrand: colours.brand, customButton: colours.button, customPage: colours.page, customBase: colours.base,
  };
  const derived = useMemo(() => deriveTheme(colours), [colours]);
  const savedColours = customThemeFrom(community.settings) ? startingColours(community, inUse.key) : null;
  const isCustom = trying === CUSTOM_THEME;
  const editing = isCustom && !browsing;
  // Your own colours that are still exactly the set theme they started from (opened on a community that uses
  // a set theme, or straight after "Start from") ARE that theme. Worked out afresh, the same three colours come
  // out a little different from how the theme draws them (its own link shade, its own way with a pale button),
  // so they are previewed, checked and saved as the theme itself, and the preview does not change until a
  // colour does. Not when they are the community's saved own colours: those are what buyers see now.
  const startTheme = isCustom && isThemeKey(colours.base)
    && sameColours({ ...themeColours(colours.base), base: colours.base }, colours)
    && !(inUse.key === CUSTOM_THEME && savedColours && sameColours(savedColours, colours))
    ? colours.base : null;
  // The theme the preview wears and Use saves: a set theme's key, or 'custom' for your own colours.
  const showing = startTheme ?? trying;
  const showingOwn = showing === CUSTOM_THEME;
  const tryingView = showingOwn ? themeView(CUSTOM_THEME, customSettings) : themeView(showing);
  // Trying on what buyers already have (and, for your own colours, not having moved any) has nothing to save.
  const isCurrent = showing === inUse.key && (!showingOwn || Boolean(savedColours && sameColours(savedColours, colours)));

  // ── the preview frames ──────────────────────────────────────────────────
  // The address carries the theme and layout, so the first paint is already right; after that every change
  // is a message, which repaints without a reload. The theme is read through a ref so trying a theme on does
  // not change the address (that WOULD reload the frame); a new layout does, and that is a reload worth having.
  const frames = useRef({});
  const showingRef = useRef(showing);
  showingRef.current = showing;
  const src = useMemo(() => previewPath(community.id, { theme: showingRef.current, layout }), [community.id, layout]);

  const message = previewMessage({ theme: showing, layout, settings: showingOwn ? customSettings : {} });
  const messageRef = useRef(message);
  messageRef.current = message;
  const messageKey = JSON.stringify(message);

  const post = useCallback((frame) => {
    frame?.contentWindow?.postMessage(messageRef.current, window.location.origin);
  }, []);
  useEffect(() => {
    Object.values(frames.current).forEach(post);
  }, [messageKey, post]);
  // A frame's load event can come before the buyer app inside it is listening, so the preview page also says
  // when it is ready ({ type, ready: true }) and is answered with the look then. Only a frame of this studio,
  // at this origin, is answered.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== PREVIEW_MESSAGE || !event.data.ready) return;
      const frame = Object.values(frames.current).find((item) => item && item.contentWindow === event.source);
      if (frame) post(frame);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);
  const frameLoaded = (event) => post(event.currentTarget);

  // ── where the keyboard goes when what it was on goes away ───────────────
  // Opening Your own colours swaps the list for the colour tools, "All themes" swaps it back, and Keep or Use
  // replace their own buttons with "This is what buyers see now". Left alone, the focus would fall to the page
  // itself and a screen reader would be left nowhere, so each of those says where it should land, and it is
  // moved there once that has been drawn.
  const focusAfter = useRef(null);
  const editorTitleRef = useRef(null);
  const ownRowRef = useRef(null);
  const nowRef = useRef(null);
  useEffect(() => {
    const target = { editor: editorTitleRef, ownRow: ownRowRef, now: nowRef }[focusAfter.current]?.current;
    if (!target) return;
    focusAfter.current = null;
    target.focus();
  });

  // ── trying on, using, keeping ──────────────────────────────────────────
  const tryOn = (key) => {
    focusAfter.current = key === CUSTOM_THEME ? 'editor' : null;
    setTrying(key);
    setBrowsing(false);
    setError('');
    setSaved('');
  };

  const browse = () => {
    focusAfter.current = 'ownRow';
    setBrowsing(true);
  };

  const keep = () => {
    focusAfter.current = 'now';
    setTrying(inUse.key);
    setBrowsing(false);
    if (inUse.key === CUSTOM_THEME && savedColours) setColours(savedColours);
    setError('');
    setSaved('');
  };

  const use = async () => {
    focusAfter.current = null;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      // Your own colours go in ONE request with the theme: the server only takes 'custom' when all three
      // colours are set once the request is applied, so sending the theme first would be refused.
      const body = showingOwn ? { theme: CUSTOM_THEME, settings: customSettings } : { theme: showing };
      await adminApi.updateCommunity(token, community.id, body);
      const fresh = await reload();
      const now = themeView(fresh?.theme ?? body.theme, fresh?.settings ?? { ...community.settings, ...body.settings });
      // What the server stored (codes in capitals), so "nothing to save" is true straight away.
      if (showingOwn && fresh) setColours(startingColours(fresh, now.key));
      focusAfter.current = 'now';
      setSaved(`Saved. Buyers now see ${now.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── the readability line under the preview ────────────────────────────
  // "4.6 to 1" is one figure, so it is never split across two lines.
  const ratio = (value) => `${value.toFixed(1)}\u00a0to\u00a01`;
  let readable;
  if (showingOwn) {
    const lowest = Math.min(...derived.checks.map((check) => check.ratio));
    const fixed = derived.fixes.length + (derived.buttonNeedsEdge ? 1 : 0);
    readable = {
      ok: true,
      text: `Every word is easy to read (lowest ${ratio(lowest)}).${fixed ? ` ${fixed === 1 ? 'One thing was' : `${fixed} things were`} fixed for you to get there.` : ''}`,
    };
  } else {
    const lowest = lowestRatio(showing);
    readable = lowest === null ? null : lowest >= 4.5
      ? { ok: true, text: `Every word is easy to read in this theme (lowest ${ratio(lowest)}).` }
      : { ok: false, text: `Some words are hard to read in this theme (lowest ${ratio(lowest)}).` };
  }

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const themes = Object.entries(THEMES).filter(([, theme]) => {
    const text = `${theme.name} ${theme.note}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  const { name } = tryingView;
  let note = THEMES[trying]?.note;
  if (startTheme) note = 'Its own colours, just as the theme draws them. Change any of the three to make them yours';
  else if (isCustom) note = `Three colours you pick, in the type and shapes of ${THEMES[colours.base]?.name ?? 'your start theme'}`;

  // ── the preview, and where it goes ─────────────────────────────────────
  // On a phone, while your own colours are being picked, the preview sits beside the wheel (as board E has it)
  // rather than a long scroll below it, so a drag shows on the buyer app straight away.
  const besideWheel = phone && editing;
  const stage = (
    <div
      className={`ax-stage${besideWheel ? ' ax-stage--beside' : ''}`}
      ref={stageRef}
      role="group"
      aria-label={`Preview of the buyer app in ${name}`}
    >
      {['phone', 'computer'].filter((kind) => scales[kind]).map((kind) => (
        <div
          key={kind}
          className={`ax-frame ax-frame--${kind}`}
          style={{ width: Math.round(SCREENS[kind].w * scales[kind]), height: Math.round(SCREENS[kind].h * scales[kind]) }}
        >
          <iframe
            ref={(el) => { frames.current[kind] = el; }}
            src={src}
            title={SCREENS[kind].title}
            width={SCREENS[kind].w}
            height={SCREENS[kind].h}
            tabIndex={-1}
            loading="eager"
            onLoad={frameLoaded}
            style={{ transform: `scale(${scales[kind]})` }}
          />
        </div>
      ))}
    </div>
  );
  // The readability check sits under the colour tools beside the preview; when the two are stacked, it goes
  // after the preview instead, so the preview comes straight after the tools that change it.
  const checks = editing ? (
    <ReadabilityCheck
      derived={derived}
      asTheme={startTheme ? { name: THEMES[startTheme].name, lowest: lowestRatio(startTheme) } : null}
    />
  ) : null;

  return (
    <section className="card elev-sm ax-studio" ref={rootRef} aria-labelledby="ax-studio-title">
      <div className={`ax-studio__grid${editing ? ' is-editing' : ''}${wide ? ' is-wide' : ''}`}>
        <div className="ax-studio__side">
          <h2 id="ax-studio-title" className="card-kicker ax-studio__title">Buyer app colours</h2>
          {editing ? (
            <>
              <OwnColours
                colours={colours}
                setColours={setColours}
                onBack={browse}
                titleRef={editorTitleRef}
                beside={besideWheel ? (
                  <div className="ax-own__see">
                    <span aria-hidden="true">How buyers will see it</span>
                    {stage}
                  </div>
                ) : null}
              />
              {wide ? checks : null}
            </>
          ) : (
            <>
              <label className="field ax-studio__find">
                <span>Find a theme</span>
                <input
                  className="input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name or feel, e.g. warm"
                />
              </label>
              <div className="ax-studio__list" role="group" aria-label="Themes to try on">
                {themes.map(([key, theme]) => (
                  <ThemeRow
                    key={key}
                    name={theme.name}
                    note={theme.note}
                    dots={<span className={`ax-dots ${themeView(key).className}`} aria-hidden="true"><span /><span /><span /></span>}
                    pressed={trying === key}
                    inUse={inUse.key === key}
                    tryingOn={trying === key && !isCurrent}
                    onClick={() => tryOn(key)}
                  />
                ))}
                {!themes.length ? (
                  <p className="ax-studio__none">No theme matches “{query.trim()}”. Try a colour or a feel, like blue or warm.</p>
                ) : null}
                <ThemeRow
                  name="Your own colours"
                  note="Pick three colours of your own on a colour wheel"
                  dots={(
                    <span className="ax-dots" aria-hidden="true">
                      <span style={{ background: derived.vars['--t-acc2'] }} />
                      <span style={{ background: derived.vars['--t-acc'] }} />
                      <span style={{ background: derived.vars['--t-bg'] }} />
                    </span>
                  )}
                  pressed={isCustom}
                  inUse={inUse.key === CUSTOM_THEME}
                  tryingOn={isCustom && !isCurrent}
                  onClick={() => tryOn(CUSTOM_THEME)}
                  buttonRef={ownRowRef}
                  own
                />
              </div>
            </>
          )}
        </div>

        <div className="ax-studio__main">
          <div className="ax-studio__head">
            <div className="ax-studio__heading">
              <span className="ax-studio__kicker">{isCurrent ? 'In use' : 'Trying on'}</span>
              <h3 className="ax-studio__name" aria-live="polite">{name}</h3>
              <p className="ax-studio__note">{note}. On your layout, {layoutName}.</p>
            </div>
            {!phone ? (
              <div role="group" aria-label="Preview on" className="ax-views">
                {VIEWS.map((item) => (
                  <button key={item.key} type="button" aria-pressed={chosen === item.key} onClick={() => setView(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {besideWheel ? null : stage}

          <div className="ax-studio__foot">
            {readable ? (
              <p className={`ax-read${readable.ok ? '' : ' is-low'}`}>
                <CheckIcon fixed={!readable.ok} />
                <span>{readable.text}</span>
              </p>
            ) : <span />}
            {isCurrent ? (
              <p className="ax-studio__now" ref={nowRef} tabIndex={-1}>This is what buyers see now.</p>
            ) : (
              <div className="ax-studio__actions">
                <button type="button" className="btn btn-ghost" onClick={keep} disabled={saving}>
                  Keep {inUse.name}
                </button>
                <button type="button" className="btn btn-primary" onClick={use} disabled={saving}>
                  {saving ? 'Saving…' : showingOwn ? 'Use these colours' : `Use ${name}`}
                </button>
              </div>
            )}
          </div>
          {!isCurrent ? (
            <p className="ax-studio__hint">Trying on changes nothing for buyers. Only the Use button saves it.</p>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
          <p role="status" className="ax-studio__saved">{saved}</p>
        </div>

        {editing && !wide ? <div className="ax-studio__after">{checks}</div> : null}
      </div>
    </section>
  );
}

/** One row of the list: a real button, pressed while its theme is being tried on. Its note shows on hover. */
function ThemeRow({ name, note, dots, pressed, inUse, tryingOn, onClick, buttonRef, own = false }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`ax-try${own ? ' ax-try--own' : ''}`}
      aria-pressed={pressed}
      title={note}
      onClick={onClick}
    >
      {dots}
      <span className="ax-try__name">{name}</span>
      {inUse ? <span className="tag tag-accent">In use</span> : null}
      {tryingOn ? <span className="tag ax-tag-on">Trying on</span> : null}
    </button>
  );
}
