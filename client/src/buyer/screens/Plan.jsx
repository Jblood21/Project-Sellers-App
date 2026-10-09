import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PLAN_LABELS, TOOL_KEYS, describeTour } from '@shared/domain.js';
import { money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';

/**
 * The booked time, for the buyer's own button. The shared description names the
 * lender from the built-in default, which is wrong once the builder has changed
 * the lender in Setup, so the topic is described here without a name.
 */
function tourSummary(tour) {
  const base = describeTour({ ...tour, topic: 'community' });
  return tour.topic === 'lender' ? `${base} · about financing` : base;
}

/** The buyer's growing record — and the door to the PDF and the team. */
export default function Plan({ onOpenTour }) {
  const { homes, lead, track } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  const savedHomes = (lead?.savedHomeIds ?? []).map((id) => homes.find((h) => h.id === id)).filter(Boolean);
  const items = TOOL_KEYS.filter((key) => lead?.plan?.[key]).map((key) => ({
    key,
    label: PLAN_LABELS[key],
    summary: lead.plan[key],
  }));
  const empty = items.length === 0 && savedHomes.length === 0;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h1 className="b-head" style={{ margin: '0 0 2px', fontSize: 22 }}>My Home Plan</h1>
      <p style={{ margin: '0 0 14px', color: 'var(--t-mut)', fontSize: 12.5 }}>
        Everything you’ve worked out so far. It fills in as you go.
      </p>

      {/*
        A count of what they have, not a score against what they have not. The
        bar and the "next step" read as homework a buyer is behind on, and this
        is a record of their own thinking — there is nothing here they owe
        anybody.
      */}
      {empty ? null : (
        <div className="b-strip">
          {items.length ? `${items.length} ${items.length === 1 ? 'answer' : 'answers'} saved` : 'No answers saved yet'}
          {savedHomes.length ? ` · ${savedHomes.length} ${savedHomes.length === 1 ? 'home' : 'homes'} you like` : ''}
        </div>
      )}

      {savedHomes.length ? (
        <div className="b-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <span className="b-lbl">Homes I Like</span>
          {savedHomes.map((home) => (
            <div key={home.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
              <span>★ {home.name}</span>
              <span style={{ color: 'var(--t-mut)' }}>{money(home.price)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="b-stack" style={{ gap: 10, marginBottom: 14 }}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(`/c/${communityId}/tool/${item.key}`, { state: { from: `/c/${communityId}/plan` } })}
            className="b-card"
            style={{
              cursor: 'pointer', padding: '14px 16px', display: 'flex', flexDirection: 'column',
              gap: 4, textAlign: 'left', color: 'var(--t-ink)',
            }}
          >
            <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>{item.label}</span>
            <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{item.summary}</span>
          </button>
        ))}
      </div>

      {empty ? (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5, marginBottom: 14 }}>
          Nothing here yet — open any tool and tap &ldquo;Add to My Home Plan&rdquo;.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="b-btn"
            onClick={() => {
              track('Downloaded My Home Plan PDF');
              navigate(`/c/${communityId}/plan/print`);
            }}
          >
            Download My Home Plan
          </button>
          <p style={{ fontSize: 11.5, color: 'var(--t-mut)', textAlign: 'center', margin: '10px 0 10px', lineHeight: 1.5 }}>
            Your saved homes, estimated payments, loan options, savings goal and move-in plan — all in one place.
          </p>
          <EmailPlanButton />
        </>
      )}

      <button type="button" className="b-btn b-btn-outline" onClick={onOpenTour}>
        {lead?.tour ? `Booked ✓ ${tourSummary(lead.tour)} — change it` : 'Talk to the team · book a time'}
      </button>
    </div>
  );
}

/**
 * Sends the buyer their own plan, only when they ask. The app already has their
 * address from the entry gate, which is exactly why this has to stay a button
 * and never become something that fires on its own.
 */
function EmailPlanButton() {
  const { lead, emailPlan } = useBuyer();
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  // One more address, for a spouse or a co-buyer. Kept on their record, so it is there next time.
  const saved = lead?.extraEmails?.[0] ?? '';
  const [also, setAlso] = useState(saved);
  const [alsoOpen, setAlsoOpen] = useState(Boolean(saved));
  const [sentTo, setSentTo] = useState([]);

  const send = async () => {
    setState('sending');
    setError('');
    try {
      const result = await emailPlan(alsoOpen ? also.trim() : undefined);
      setSentTo([result.to, ...(result.also ?? []).filter((entry) => entry.sent).map((entry) => entry.to)]);
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <p role="status" style={{ fontSize: 12.5, color: 'var(--t-acc2)', textAlign: 'center', margin: '0 0 14px', fontWeight: 600 }}>
        Sent to {sentTo.join(' and ')} ✓
      </p>
    );
  }

  return (
    <>
      {alsoOpen ? (
        <label className="b-field" style={{ marginBottom: 10 }}>
          <span className="b-lbl">Also send it to (optional)</span>
          <input
            className="b-in" type="email" value={also} onChange={(event) => setAlso(event.target.value)}
            placeholder="another@email.com" autoComplete="off" inputMode="email"
          />
        </label>
      ) : (
        <button
          type="button" onClick={() => setAlsoOpen(true)}
          style={{
            display: 'block', width: '100%', minHeight: 44, margin: '0 0 4px', border: 'none', background: 'transparent',
            color: 'var(--t-accT)', fontFamily: 'var(--t-font)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Also send it to another email
        </button>
      )}
      <button
        type="button"
        className="b-btn b-btn-outline"
        onClick={send}
        disabled={state === 'sending'}
        style={{ marginBottom: error ? 6 : 14 }}
      >
        {state === 'sending' ? 'Sending…' : 'Email this plan to me'}
      </button>
      {error ? (
        <p style={{ fontSize: 12, color: 'var(--t-mut)', textAlign: 'center', margin: '0 0 14px', lineHeight: 1.45 }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
