import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { consentText } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lead capture. Nothing past this point works without a lead record. */
export default function Gate({ onEntered }) {
  const { community, enter } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  // Unchecked. A pre-ticked box is not agreement to anything, and under the
  // TCPA it is the difference between a consent record and an admission.
  const [form, setForm] = useState({ name: '', email: '', phone: '', consent: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const digits = (form.phone.match(/\d/g) || []).length;
  const hasPhone = digits >= 7;

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !EMAIL_RE.test(form.email)) {
      setError('Please add your full name and a valid email.');
      return;
    }
    // A number is optional, but one that is typed has to look like one.
    if (form.phone.trim() && digits < 7) {
      setError('That cell number looks too short. Check it, or leave it blank for now.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await enter({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        // About calls and texts to a number: with no number there is nothing to agree to.
        consent: hasPhone && form.consent,
      });
      onEntered?.(result);
      navigate(`/c/${communityId}/tools`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="b-shell b-gate" onSubmit={submit} style={{ paddingTop: 'calc(28px + env(safe-area-inset-top))' }}>
      <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>Almost there</span>
      <h1 className="b-head" style={{ margin: '4px 0 8px', fontSize: 27 }}>Let&apos;s introduce you</h1>
      <p style={{ margin: '0 0 18px', color: 'var(--t-mut)', fontSize: 13.5, lineHeight: 1.5 }}>
        Tell us who you are to open the {community?.name} app, so your home plan saves and the
        team can send it to you.
      </p>
      <div className="b-stack" style={{ gap: 12 }}>
        <label className="b-field">
          <span className="b-lbl">Full name</span>
          <input className="b-in" value={form.name} onChange={set('name')} placeholder="Jordan Lee" autoComplete="name" />
        </label>
        <label className="b-field">
          <span className="b-lbl">Email</span>
          <input
            className="b-in" type="email" value={form.email} onChange={set('email')}
            placeholder="you@email.com" autoComplete="email" inputMode="email"
          />
        </label>
        <label className="b-field">
          <span className="b-lbl">Cell phone (optional)</span>
          <input
            className="b-in" type="tel" value={form.phone} onChange={set('phone')}
            placeholder="(801) 555-0100" autoComplete="tel" inputMode="tel"
          />
        </label>
      </div>
      {/*
        Separate from the fields above on purpose. Those are what the app needs
        to work; this is permission to market, and the TCPA cares a great deal
        that the second is a choice rather than the price of the first. It is
        never required to get in — a number given under duress is a liability,
        not a lead.
      */}
      {hasPhone ? (
        <label
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, padding: '12px 14px',
            borderRadius: 'var(--t-rad)', background: 'var(--t-tint)',
            border: '1px solid var(--t-line)', cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(event) => setForm((prev) => ({ ...prev, consent: event.target.checked }))}
            style={{ marginTop: 2, width: 18, height: 18, flex: 'none', accentColor: 'var(--t-acc)' }}
          />
          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--t-ink)' }}>
            {consentText(community?.builder || community?.name)}
          </span>
        </label>
      ) : null}

      {error ? <p style={{ color: 'var(--t-accT)', fontSize: 12.5, margin: '10px 0 0' }}>{error}</p> : null}
      <button type="submit" className="b-btn" disabled={busy} style={{ marginTop: 16, minHeight: 50 }}>
        {busy ? 'One moment…' : `Start exploring ${community?.name}`}
      </button>
      <p style={{ fontSize: 11, color: 'var(--t-mut)', margin: '10px 0 0', textAlign: 'center' }}>
        Name and email are all you need to get in. Add a cell if you'd like the team to be able to call or
        text you. Your info goes only to the {community?.name} team.
      </p>
    </form>
  );
}
