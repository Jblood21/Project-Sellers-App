import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PLAN_LABELS, TOOL_KEYS, describeTour } from '@shared/domain.js';
import { buyerApi } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { planProgress } from '../progress.js';

/** The buyer's growing record — and the door to the PDF and the team. */
export default function Plan({ onOpenTour }) {
  const { homes, lead, track } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  const progress = planProgress(lead, communityId);
  const savedHomes = (lead?.savedHomeIds ?? []).map((id) => homes.find((h) => h.id === id)).filter(Boolean);
  const items = TOOL_KEYS.filter((key) => lead?.plan?.[key]).map((key) => ({
    key,
    label: PLAN_LABELS[key],
    summary: lead.plan[key],
  }));
  const empty = items.length === 0 && savedHomes.length === 0;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h3 className="b-head" style={{ margin: '0 0 2px', fontSize: 22 }}>My Home Plan</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--t-mut)', fontSize: 12.5 }}>
        Your personal record of everything so far — it builds as you go.
      </p>

      <div style={{ background: 'var(--t-tint)', borderRadius: 'var(--t-radlg)', padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{progress.percent}% complete</span>
          <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>Next: {progress.nextLabel}</span>
        </div>
        <div className="b-bar"><span style={{ width: `${progress.percent}%` }} /></div>
      </div>

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
            onClick={() => navigate(`/c/${communityId}/tool/${item.key}`)}
            className="b-card"
            style={{
              cursor: 'pointer', padding: '14px 16px', display: 'flex', flexDirection: 'column',
              gap: 4, textAlign: 'left', color: 'var(--t-ink)',
            }}
          >
            <span className="b-lbl" style={{ color: 'var(--t-acc)' }}>{item.label}</span>
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
        {lead?.tour ? `Booked ✓ ${describeTour(lead.tour)} — change it` : 'Talk to the team · book a time'}
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
  const { lead, token, track } = useBuyer();
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const send = async () => {
    setState('sending');
    setError('');
    try {
      await buyerApi.emailPlan(token);
      track('Emailed their home plan to themselves');
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--t-acc2)', textAlign: 'center', margin: '0 0 14px', fontWeight: 600 }}>
        Sent to {lead?.email} ✓
      </p>
    );
  }

  return (
    <>
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
