import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { CONTACT_METHODS, formatSlotDate, formatSlotTime, TOOLS } from '@shared/domain.js';
import { buyerApi } from '../lib/api.js';
import { ArrowUp, ChevronLeft, Menu } from '../components/Icons.jsx';
import { useBuyer } from './BuyerContext.jsx';

const TUTORIAL = [
  {
    title: 'Explore the homes',
    body: 'Browse every home in this community with photos, prices and details. Tap the star on any home you like — it saves to "Homes I Like" so you can come back to it.',
  },
  {
    title: 'Answer natural questions',
    body: 'Each tool answers one question: what would it cost me each month, what can I afford, what financing could work, could I get down payment help. No mortgage jargon required.',
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


/** Sticky, translucent, never scrolls away — the buyer must always be able to leave a tool. */
export function BuyerHeader({ onOpenMenu }) {
  const { community } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();

  const onHomeDetail = /\/homes\//.test(location.pathname);
  const atTools = location.pathname.endsWith('/tools');
  const backLabel = onHomeDetail ? 'Homes' : 'All Tools';
  const goBack = () => navigate(onHomeDetail ? `/c/${communityId}/explore` : `/c/${communityId}/tools`);

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
            color: 'var(--t-acc)', fontFamily: 'var(--t-font)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', flex: 'none',
          }}
        >
          <ChevronLeft />
          {backLabel}
        </button>
      )}
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        <div
          className="b-head"
          style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {community?.name}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--t-mut)' }}>{community?.location}</div>
      </div>
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
    </header>
  );
}

export function MenuDrawer({ open, onClose, onShowTutorial, onAddToPhone }) {
  const { community, lead } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();

  if (!open) return null;

  const enabled = TOOLS.filter((tool) => community?.tools?.[tool.k]);
  const items = [
    { label: 'All Tools', to: `/c/${communityId}/tools` },
    { label: 'Explore Homes', to: `/c/${communityId}/explore` },
    ...(community?.highlights?.length ? [{ label: 'Around Here', to: `/c/${communityId}/area` }] : []),
    ...(community?.features?.siteMap && community?.siteMap
      ? [{ label: 'Site Map', to: `/c/${communityId}/map` }]
      : []),
    ...enabled.map((tool) => ({
      label: tool.name,
      to: `/c/${communityId}/tool/${tool.k}`,
      done: Boolean(lead?.plan?.[tool.k]),
    })),
    { label: 'Homes I Like', to: `/c/${communityId}/saved` },
    { label: 'My Home Plan', to: `/c/${communityId}/plan` },
  ];

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
        className="scroll-y"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
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
              minHeight: 46, padding: '0 12px', borderRadius: 'var(--t-rad)', border: 'none',
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
      </div>
    </div>
  );
}

const menuSecondary = {
  minHeight: 46,
  padding: '0 12px',
  borderRadius: 'var(--t-rad)',
  border: 'none',
  background: 'transparent',
  color: 'var(--t-acc)',
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

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;
  const last = step === TUTORIAL.length - 1;

  return (
    <div className="b-sheet-backdrop" role="dialog" aria-label="Show me around">
      <div className="b-sheet">
        <span className="b-lbl" style={{ color: 'var(--t-acc)' }}>
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

export function TourDialog({ open, onClose }) {
  const { community, communityId, requestTour, lead } = useBuyer();
  const [slots, setSlots] = useState(community?.slots ?? []);
  const [picked, setPicked] = useState(null);
  const [contact, setContact] = useState('phone');
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (open) setPicked(lead?.tour?.slotId ?? null);
  }, [open, lead?.tour?.slotId]);

  if (!open) return null;

  const byDate = [];
  for (const slot of slots) {
    const last = byDate[byDate.length - 1];
    if (last && last[0] === slot.date) last[1].push(slot);
    else byDate.push([slot.date, [slot]]);
  }

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    const done = await requestTour(picked, contact);
    setBusy(false);
    if (done) onClose();
    // On a clash the dialog stays open with a fresh list, so they can pick again.
    else buyerApi.openSlots(communityId).then(setSlots).catch(() => {});
  };

  return (
    <div className="b-sheet-backdrop" role="dialog" aria-label="Talk to the team">
      <div className="b-sheet" style={{ maxHeight: '86vh', overflowY: 'auto' }}>
        <span className="b-head" style={{ fontSize: 20 }}>Talk to the team</span>

        {byDate.length === 0 ? (
          <>
            <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
              The {community?.name} team has not published any times yet. Check back shortly —
              or reach them through the community website.
            </span>
            <button type="button" className="b-btn" onClick={onClose} style={{ marginTop: 8 }}>
              Close
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
              Pick a time that suits you. These are the times the {community?.name} team is free.
            </span>

            <div className="b-stack" style={{ gap: 12, margin: '10px 0 4px' }}>
              {byDate.map(([date, daySlots]) => (
                <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="b-lbl">{formatSlotDate(date)}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {daySlots.map((slot) => (
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
                </div>
              ))}
            </div>

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

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="b-btn b-btn-outline" onClick={onClose} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                className="b-btn"
                style={{ flex: 1 }}
                disabled={!picked || busy}
                onClick={send}
              >
                {busy ? 'Booking…' : 'Book it'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AddToPhoneDialog({ open, onClose }) {
  const { community } = useBuyer();
  if (!open) return null;

  return (
    <div className="b-sheet-backdrop" role="dialog" aria-label="Add to my phone">
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
          It appears as an app icon on your home screen — one tap brings you right back to this community.
          On iPhone: Share <ArrowUp size={13} /> → “Add to Home Screen”. On Android: tap “Install app”.
        </span>
        <button type="button" className="b-btn" onClick={onClose} style={{ marginTop: 6 }}>
          Got it
        </button>
      </div>
    </div>
  );
}
