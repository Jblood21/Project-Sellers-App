import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { CONTACT_METHODS, consentText, formatSlotDate, formatSlotTime, safeHref, TOOLS } from '@shared/domain.js';
import { complianceOf, SAFE_EMAIL_RE, telHref } from '@shared/compliance.js';
import { buyerApi } from '../lib/api.js';
import { emailHref, financingMessage, tourMessage } from '../lib/contact.js';
import { ArrowUp, ChevronLeft, Menu } from '../components/Icons.jsx';
import { useBuyer } from './BuyerContext.jsx';
import CommunityMark from './CommunityMark.jsx';
import TextAction from './TextAction.jsx';
import useDialog from './useDialog.js';

const TUTORIAL = [
  {
    title: 'Explore the homes',
    body: 'Browse every home in this community with photos, prices and details. Tap the star on any home you like — it saves to "Homes I Like" so you can come back to it.',
  },
  {
    title: 'Get plain answers',
    body: 'Each tool answers one question. What would it cost me each month? What can I afford? What financing could work? Could I get help with a down payment? No mortgage jargon.',
  },
  {
    title: 'Your plan builds itself',
    body: 'Every answer you save goes into My Home Plan. Watch it fill up — when you’re ready, download the whole thing as a PDF to keep or share.',
  },
  {
    title: 'Real people, when you want',
    body: 'Request a tour or a call anytime from My Home Plan. The team sees what you’ve saved, so they can actually help instead of starting from zero.',
  },
];


/**
 * Sticky, translucent, never scrolls away — the buyer must always be able to leave a tool.
 *
 * Props, shared with the headers a layout may supply in its place:
 *   onOpenMenu  opens the menu drawer
 *   onTalk      opens the talk-to-the-team sheet; this header has no button for
 *               it (the menu and every screen already do) and a layout's does
 *   signedIn    false on the public guide pages, where the tools menu would only
 *               bounce a visitor to the contact gate. The header then offers the
 *               one thing that is useful there: the way into the app.
 */
export function BuyerHeader({ onOpenMenu, signedIn = true }) {
  const { community } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();

  const onHomeDetail = /\/homes\//.test(location.pathname);
  const onGuide = /\/guides\/[^/]+$/.test(location.pathname);
  const atTools = location.pathname.endsWith('/tools');
  // A signed-out reader's "back" is the front door, not a tools screen they
  // cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? 'All Tools' : 'Back';
  const backTo = onHomeDetail
    ? `/c/${communityId}/explore`
    : onGuide
      ? `/c/${communityId}/guides`
      : signedIn
        ? `/c/${communityId}/tools`
        : `/c/${communityId}`;
  const goBack = () => navigate(backTo);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 12px',
        paddingTop: 'calc(10px + env(safe-area-inset-top))',
        background: 'color-mix(in srgb, var(--t-bg) 90%, transparent)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--t-line)',
      }}
    >
      {atTools ? (
        <span style={{ width: 64, flex: 'none' }} />
      ) : (
        <button
          type="button"
          onClick={goBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 3, minHeight: 40, padding: '0 10px 0 6px',
            borderRadius: 'var(--t-radbtn)', border: 'none', background: 'transparent',
            color: 'var(--t-accT)', fontFamily: 'var(--t-font)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', flex: 'none',
          }}
        >
          <ChevronLeft />
          {backLabel}
        </button>
      )}
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        {community?.logo || community?.logoLight ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CommunityMark tone="light" height={28} />
          </div>
        ) : (
          <div
            className="b-head"
            style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {community?.name}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--t-mut)' }}>{community?.location}</div>
      </div>
      {signedIn ? (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Menu"
          style={{
            width: 44, height: 44, flex: 'none', borderRadius: 'var(--t-radbtn)',
            border: '1px solid var(--t-line)', background: 'var(--t-sur)', color: 'var(--t-ink)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Menu />
        </button>
      ) : (
        <Link
          to={`/c/${communityId}`}
          className="b-btn"
          style={{
            width: 'auto', flex: 'none', minHeight: 44, padding: '0 14px', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
          }}
        >
          Sign in
        </Link>
      )}
    </header>
  );
}

export function MenuDrawer({ open, onClose, onShowTutorial, onAddToPhone }) {
  const { community, lead, features, guides, agents } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const dialogRef = useRef(null);
  useDialog(open, onClose, dialogRef);

  if (!open) return null;

  const enabled = TOOLS.filter((tool) => community?.tools?.[tool.k]);
  const items = [
    { label: 'All Tools', to: `/c/${communityId}/tools` },
    { label: 'Explore Homes', to: `/c/${communityId}/explore` },
    ...(community?.highlights?.length ? [{ label: 'Local Spots', to: `/c/${communityId}/area` }] : []),
    ...(community?.features?.siteMap && community?.siteMap
      ? [{ label: 'Site Map', to: `/c/${communityId}/map` }]
      : []),
    ...enabled.map((tool) => ({
      label: tool.name,
      to: `/c/${communityId}/tool/${tool.k}`,
      done: Boolean(lead?.plan?.[tool.k]),
    })),
    // The server empties these lists when the builder switches the feature off;
    // the flag is checked as well so a stale payload cannot show a dead link.
    ...(features.guides && guides.length ? [{ label: 'Buyer guides', to: `/c/${communityId}/guides` }] : []),
    ...(features.agents && agents.length ? [{ label: agents.length > 1 ? 'Meet the agents' : 'Meet the agent', to: `/c/${communityId}/realtors` }] : []),
    { label: 'Homes I Like', to: `/c/${communityId}/saved` },
    { label: 'My Home Plan', to: `/c/${communityId}/plan` },
  ];
  // The landing page no longer has a button for the builder's own website, so the menu is where it lives.
  const website = safeHref(community?.websiteUrl ?? '');

  const go = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,10,12,.45)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        ref={dialogRef}
        // No scroll-y class: that hides the scrollbar, and with sixteen entries the
        // list runs past a short phone, where the scrollbar is the only sign of it.
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        style={{
          width: 'min(300px, 84vw)', height: '100%', overflowY: 'auto', background: 'var(--t-bg)',
          borderLeft: '1px solid var(--t-line)', padding: '24px 16px calc(24px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        <span className="b-lbl" style={{ padding: '0 10px 10px' }}>
          {community?.name} · {community?.location}
        </span>
        {items.map((item) => (
          <button
            key={item.to + item.label}
            type="button"
            onClick={() => go(item.to)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
              minHeight: 44, padding: '0 12px', borderRadius: 'var(--t-rad)', border: 'none',
              background: location.pathname === item.to ? 'var(--t-tint)' : 'transparent',
              color: 'var(--t-ink)', fontFamily: 'var(--t-font)', fontSize: 14.5, fontWeight: 500,
              textAlign: 'left', cursor: 'pointer',
            }}
          >
            <span>{item.label}</span>
            {item.done ? <span style={{ color: 'var(--t-acc2)', fontWeight: 700 }}>✓</span> : null}
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--t-line)', margin: '10px 12px' }} />
        <button
          type="button"
          onClick={() => {
            onClose();
            onShowTutorial();
          }}
          style={menuSecondary}
        >
          Show Me Around
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onAddToPhone();
          }}
          style={menuSecondary}
        >
          Add to My Phone
        </button>
        {website ? (
          <a href={website} target="_blank" rel="noopener noreferrer" style={{ ...menuSecondary, display: 'flex', alignItems: 'center' }}>
            Community website
          </a>
        ) : null}
      </div>
    </div>
  );
}

const menuSecondary = {
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 'var(--t-rad)',
  border: 'none',
  background: 'transparent',
  color: 'var(--t-accT)',
  fontFamily: 'var(--t-font)',
  fontSize: 14.5,
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
};

export function Toast() {
  const { toast } = useBuyer();
  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 80,
        maxWidth: 'calc(100vw - 40px)', padding: '11px 18px', borderRadius: 999,
        background: '#15181c', color: '#fff', fontSize: 13.5, fontWeight: 500,
        boxShadow: '0 8px 24px rgba(0,0,0,.25)',
      }}
    >
      {toast}
    </div>
  );
}

export function TutorialSheet({ open, onClose }) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef(null);
  useDialog(open, onClose, dialogRef);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;
  const last = step === TUTORIAL.length - 1;

  return (
    <div ref={dialogRef} className="b-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Show me around">
      <div className="b-sheet">
        <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>
          Show me around · {step + 1} of {TUTORIAL.length}
        </span>
        <span className="b-head" style={{ fontSize: 21 }}>{TUTORIAL[step].title}</span>
        <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--t-mut)' }}>{TUTORIAL[step].body}</span>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button type="button" className="b-btn b-btn-outline" onClick={onClose} style={{ flex: 1 }}>
            Skip
          </button>
          <button
            type="button"
            className="b-btn"
            style={{ flex: 1 }}
            onClick={() => (last ? onClose() : setStep((s) => s + 1))}
          >
            {last ? 'Start exploring' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** How many days the time picker offers at once. */
const DAYS_SHOWN = 6;

// The same rule the server applies, so a field the server would refuse never has its button enabled.
const EMAIL_LOOKS_RIGHT = SAFE_EMAIL_RE;

/**
 * One person to reach, with Call, Text and Email under their name. Each opens the buyer's own phone or
 * mail app with the message already written. Text is a link on a phone and, on a computer (which cannot
 * send one), a button that copies the number and says so.
 */
function ReachRow({ contact, message, subject, onAct }) {
  const dial = telHref(contact.phone);
  const mail = emailHref(contact.email, subject, message);
  if (!dial && !contact.phone && !mail) return null;
  return (
    <div className="b-reach">
      <div className="b-reach__who">
        <strong>{contact.name}</strong>
        {contact.detail ? <span className="b-reach__detail"> · {contact.detail}</span> : null}
      </div>
      <div className="b-agent__actions">
        {dial ? <a className="b-agent__act" href={dial} onClick={() => onAct('call')}>Call</a> : null}
        <TextAction className="b-agent__act" phone={contact.phone} message={message} onAct={onAct} />
        {mail ? <a className="b-agent__act" href={mail} onClick={() => onAct('email')}>Email</a> : null}
      </div>
    </div>
  );
}

/**
 * Where "Book a tour" (and "Talk about financing") lead. Normally a day, then a time, from the times the
 * builder published. When booking is switched off, or no times are published (a dead end before), it is
 * the people to call, text or email: the sales team and the realtors for a tour, the lender for financing.
 * Booking is treated as on unless the builder switched it off, so an older cached payload never hides it.
 */
export function TourDialog({ topic, onClose }) {
  const open = Boolean(topic);
  const lender = topic === 'lender';
  const { community, communityId, requestTour, lead, features, agents, settings, track } = useBuyer();
  // The lender is whoever Setup says it is, the same name the footer and the
  // Financing card print, so the sheet cannot contradict them.
  const lenderInfo = complianceOf(community?.settings, { community }).lender;
  const lenderName = lenderInfo.name || 'the lender';
  const [slots, setSlots] = useState(community?.slots ?? []);
  const [picked, setPicked] = useState(null);
  // The day chosen first; the times for it open underneath once there is one.
  const [day, setDay] = useState(null);
  const [moreDays, setMoreDays] = useState(false);
  const [contact, setContact] = useState('phone');
  const [busy, setBusy] = useState(false);
  // 'times' (pick a day and time) or 'people' (call, text or email). Booking off or no times: always 'people'.
  const [view, setView] = useState('times');
  // Meeting with the team needs a number to reach them on. A buyer who signed up without one is
  // asked here, with the same calls-and-texts question the sign-up form asks.
  const needsPhone = Boolean(lead) && !lead.phone;
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const phoneOk = (phone.match(/\d/g) || []).length >= 7;
  // One more email, for a spouse or co-buyer. Prefilled when they already gave one.
  const savedExtra = lead?.extraEmails?.[0] ?? '';
  const [extra, setExtra] = useState('');
  const extraTrimmed = extra.trim();
  const extraBad = extraTrimmed !== '' && !EMAIL_LOOKS_RIGHT.test(extraTrimmed);
  const dialogRef = useRef(null);
  useDialog(open, onClose, dialogRef);

  // Re-read on open: the community payload was fetched when they arrived, and
  // somebody else may have taken a time since.
  useEffect(() => {
    if (!open) return;
    let live = true;
    buyerApi.openSlots(communityId)
      .then((fresh) => { if (live) setSlots(fresh); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, communityId]);

  // Each time the sheet opens it starts as a short list of days with nothing picked.
  // A buyer's own booking is never in the open list (a booked time leaves it), so it
  // is shown as a line of text below instead of as a choice that cannot be seen.
  useEffect(() => {
    if (open) {
      setDay(null);
      setPicked(null);
      setMoreDays(false);
      setPhone('');
      setAgreed(false);
      setView('times');
      setExtra(savedExtra);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when it opens, not when the lead object changes
  }, [open]);

  // A refreshed list can lose the time that was chosen (somebody else took it).
  // Clearing it keeps "Book it" from being enabled for a time nobody can see.
  useEffect(() => {
    if (picked && !slots.some((item) => item.id === picked)) setPicked(null);
  }, [slots, picked]);

  if (!open) return null;

  const bookingOn = features?.booking !== false;
  const byDate = [];
  for (const slot of bookingOn ? slots : []) {
    const last = byDate[byDate.length - 1];
    if (last && last[0] === slot.date) last[1].push(slot);
    else byDate.push([slot.date, [slot]]);
  }
  const canPick = bookingOn && byDate.length > 0;
  const showPeople = !canPick || view === 'people';
  // A few days, not every day the builder has published: the next ones are what
  // a buyer is choosing between, and a wall of dates is what this replaced.
  // "More days" reaches the rest, so nothing the builder published is out of reach.
  const dayIsHidden = day && !byDate.slice(0, DAYS_SHOWN).some(([date]) => date === day);
  const days = moreDays || dayIsHidden ? byDate : byDate.slice(0, DAYS_SHOWN);
  const times = byDate.find(([date]) => date === day)?.[1] ?? [];

  const title = lender ? 'Talk about financing' : 'Book a tour';
  const reach = lender
    ? [{ name: lenderName, detail: '', phone: lenderInfo.phone, email: lenderInfo.email, isTeam: true }]
    : [
      { name: `${community?.name ?? 'The'} team`, detail: '', phone: settings?.teamPhone, email: settings?.teamEmail, isTeam: true },
      ...(features?.agents ? agents : []).map((agent) => ({
        name: agent.name, detail: agent.brokerage, phone: agent.phone, email: agent.email, isTeam: false,
      })),
    ];
  const people = reach.filter((person) => telHref(person.phone) || emailHref(person.email, 'x', 'x'));
  const messageFor = (person) => (lender
    ? financingMessage({ lenderName: person.name, community: community?.name, buyerName: lead?.name })
    : tourMessage({ agentName: person.isTeam ? '' : person.name, community: community?.name, buyerName: lead?.name }));
  const subject = lender ? `Talk about financing — ${community?.name}` : `Book a tour at ${community?.name}`;
  // What the sheet says above the list. "Call, text or email" is only said when there is someone to do it
  // with, and what is missing is said as it is: no times posted, or booking switched off.
  const intro = [
    lender
      ? `Call, text or email ${lenderName} to talk about financing.`
      : (people.length ? 'Call, text or email to book an appointment.' : ''),
    !lender && bookingOn && !canPick ? `The ${community?.name} team hasn’t posted times to pick from yet.` : '',
  ].filter(Boolean).join(' ');

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    const extras = {
      ...(needsPhone ? { phone: phone.trim(), consent: agreed } : {}),
      // Only when it was changed, so leaving a saved address alone never rewrites it.
      ...(extraTrimmed !== savedExtra ? { extraEmail: extraTrimmed } : {}),
    };
    const done = await requestTour(picked, contact, lender ? 'lender' : 'community', extras);
    setBusy(false);
    if (done) onClose();
    // On a clash the dialog stays open with a fresh list, so they can pick again.
    else buyerApi.openSlots(communityId).then(setSlots).catch(() => {});
  };

  return (
    <div
      ref={dialogRef}
      className="b-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="b-sheet" style={{ maxHeight: '86vh', overflowY: 'auto' }}>
        <span className="b-head" style={{ fontSize: 20 }}>{title}</span>

        {showPeople ? (
          <>
            {intro ? <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>{intro}</span> : null}
            {people.length ? (
              <div className="b-reach__list">
                {people.map((person) => (
                  <ReachRow
                    key={`${person.name}-${person.phone}-${person.email}`}
                    contact={person}
                    message={messageFor(person)}
                    subject={subject}
                    onAct={(what) => track(`${lender ? 'Reached out about financing' : 'Reached out to book a tour'} (${what}): ${person.name}`)}
                  />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
                {lender || !bookingOn ? 'The team hasn’t added a phone number or email here yet. You can ask them in person.' : 'Check back soon, or ask the team in person.'}
              </span>
            )}
            {canPick ? (
              <button type="button" className="b-btn" onClick={() => setView('times')} style={{ marginTop: 4 }}>
                Pick a day and time instead
              </button>
            ) : null}
            <button type="button" className="b-btn b-btn-outline" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            {lead?.tour?.date && lead?.tour?.time ? (
              <span style={{ fontSize: 13.5, color: 'var(--t-ink)', lineHeight: 1.5, fontWeight: 600 }}>
                You’re booked for {formatSlotDate(lead.tour.date)} at {formatSlotTime(lead.tour.time)}. To move it, pick another time.
              </span>
            ) : null}
            <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
              {lender
                ? `Pick a day, then a time, and the ${community?.name} team will set you up with ${lenderName}.`
                : `Pick a day, then a time that suits you. These are the times the ${community?.name} team is free.`}
            </span>

            <span className="b-lbl" style={{ marginTop: 10 }}>Pick a day</span>
            <div role="group" aria-label="Pick a day" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0' }}>
              {days.map(([date]) => (
                <button
                  key={date}
                  type="button"
                  className="b-pill"
                  data-on={day === date}
                  aria-pressed={day === date}
                  onClick={() => {
                    setDay(date);
                    setPicked(null);
                  }}
                  style={{ flex: 'none', padding: '0 14px' }}
                >
                  {formatSlotDate(date)}
                </button>
              ))}
              {byDate.length > days.length ? (
                <button
                  type="button"
                  className="b-pill"
                  onClick={() => setMoreDays(true)}
                  style={{ flex: 'none', padding: '0 14px' }}
                >
                  More days
                </button>
              ) : null}
            </div>

            {day ? (
              <>
                <span className="b-lbl" style={{ marginTop: 6 }}>Pick a time</span>
                <div role="group" aria-label="Pick a time" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0' }}>
                  {times.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className="b-pill"
                      data-on={picked === slot.id}
                      aria-pressed={picked === slot.id}
                      onClick={() => setPicked(slot.id)}
                      style={{ flex: 'none', padding: '0 14px' }}
                    >
                      {formatSlotTime(slot.time)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <span className="b-lbl" style={{ marginTop: 6 }}>How should they reach you?</span>
            <div style={{ display: 'flex', gap: 6, margin: '4px 0 8px' }}>
              {CONTACT_METHODS.map((method) => (
                <button
                  key={method.k}
                  type="button"
                  className="b-pill"
                  data-on={contact === method.k}
                  aria-pressed={contact === method.k}
                  onClick={() => setContact(method.k)}
                  style={{ flex: 1 }}
                >
                  {method.label}
                </button>
              ))}
            </div>

            {needsPhone ? (
              <>
                <label className="b-field" style={{ marginTop: 4 }}>
                  <span className="b-lbl">Your cell number</span>
                  <input
                    className="b-in" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)}
                    placeholder="(801) 555-0100" autoComplete="tel" inputMode="tel"
                  />
                </label>
                <span style={{ fontSize: 12, color: 'var(--t-mut)', lineHeight: 1.45, margin: '2px 0 4px' }}>
                  We need a number so the team can reach you about your time.
                </span>
                <label
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                    borderRadius: 'var(--t-rad)', background: 'var(--t-tint)',
                    border: '1px solid var(--t-line)', cursor: 'pointer', marginBottom: 8,
                  }}
                >
                  <input
                    type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)}
                    style={{ marginTop: 2, width: 18, height: 18, flex: 'none', accentColor: 'var(--t-acc)' }}
                  />
                  <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--t-ink)' }}>
                    {consentText(community?.builder || community?.name)}
                  </span>
                </label>
              </>
            ) : null}

            <label className="b-field" style={{ marginBottom: 8 }}>
              <span className="b-lbl">Add another email (optional)</span>
              <input
                className="b-in" type="email" value={extra} onChange={(event) => setExtra(event.target.value)}
                placeholder="spouse@email.com" autoComplete="off" inputMode="email" aria-invalid={extraBad || undefined}
              />
              {extraBad ? (
                <span role="alert" style={{ fontSize: 12, color: 'var(--t-accT)' }}>That email doesn’t look right.</span>
              ) : null}
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="b-btn b-btn-outline" onClick={onClose} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                className="b-btn"
                style={{ flex: 1 }}
                disabled={!picked || busy || (needsPhone && !phoneOk) || extraBad}
                onClick={send}
              >
                {busy ? 'Booking…' : 'Book it'}
              </button>
            </div>
            <button
              type="button" onClick={() => setView('people')}
              style={{
                minHeight: 44, border: 'none', background: 'transparent', color: 'var(--t-accT)',
                fontFamily: 'var(--t-font)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Or call, text or email instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AddToPhoneDialog({ open, onClose }) {
  const { community } = useBuyer();
  const dialogRef = useRef(null);
  useDialog(open, onClose, dialogRef);
  if (!open) return null;

  return (
    <div ref={dialogRef} className="b-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Add to my phone">
      <div className="b-sheet" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: 72, height: 72, borderRadius: 18, background: 'var(--t-acc)', color: 'var(--t-onacc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            fontFamily: 'var(--t-head)', fontWeight: 'var(--t-headwt)', fontSize: 32,
          }}
        >
          {community?.iconPhoto ? (
            <img className="photo-img" src={community.iconPhoto} alt="" />
          ) : (
            community?.name?.[0]
          )}
        </div>
        <span className="b-head" style={{ fontSize: 19 }}>Keep {community?.name} on your phone</span>
        <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.55 }}>
          It shows up as an icon on your home screen, so one tap brings you right back to this community.
          On iPhone, tap Share <ArrowUp size={13} /> and choose “Add to Home Screen”. On Android, tap “Install app”.
        </span>
        <button type="button" className="b-btn" onClick={onClose} style={{ marginTop: 6 }}>
          Got it
        </button>
      </div>
    </div>
  );
}
