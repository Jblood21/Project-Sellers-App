import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { limitedPrivacyText, privacyBoxText } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import useDialog, { closeOnBackdrop } from '../useDialog.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lead capture. Nothing past this point works without a lead record. The page that holds it (the
 * landing page) puts nothing around it: no headline, no explanation. The fields are the name, the cell
 * number (optional) and the email; a name and an email open the app, together with the privacy box. The box is
 * required: ticked, the person agrees to email (and to calls and texts when they gave a number). Left unticked,
 * pressing the button brings up the email-only terms (no calls or texts), and accepting those is the other way in.
 */
export default function GateForm({ onEntered }) {
  const { community, enter, isListing } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  // Unchecked. A pre-ticked box is not agreement to anything, and under the
  // TCPA it is the difference between a consent record and an admission.
  const [form, setForm] = useState({ name: '', email: '', phone: '', consent: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [askLimited, setAskLimited] = useState(false);
  const who = community?.builder || community?.name;

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const digits = (form.phone.match(/\d/g) || []).length;
  const hasPhone = digits >= 7;

  /** Checks the fields; true when they are fine. */
  const fieldsOk = () => {
    if (!form.name.trim() || !EMAIL_RE.test(form.email)) {
      setError('Please add your full name and a valid email.');
      return false;
    }
    // A number is optional, but one that is typed has to look like one.
    if (form.phone.trim() && digits < 7) {
      setError('That cell number looks too short. Check it, or leave it blank for now.');
      return false;
    }
    return true;
  };

  /** Signs in with how they chose to: 'agreed' (box ticked) or 'email_only' (the email-only terms). */
  const enterWith = async (privacy) => {
    setBusy(true);
    setError('');
    try {
      const result = await enter({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        privacy,
        // About calls and texts to a number: with no number there is nothing to agree to, and the email-only terms never agree to them.
        consent: privacy === 'agreed' && hasPhone,
      });
      onEntered?.(result);
      navigate(`/c/${communityId}/${isListing ? 'home' : 'tools'}`, { replace: true });
    } catch (err) {
      setAskLimited(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (!fieldsOk()) return;
    // The box is required. Unticked, the email-only terms come up instead of going in.
    if (form.consent) enterWith('agreed');
    else setAskLimited(true);
  };

  return (
    <form className="b-gateform" onSubmit={submit}>
      <div className="b-stack" style={{ gap: 12 }}>
        <label className="b-field">
          <span className="b-lbl">Full name</span>
          <input className="b-in" value={form.name} onChange={set('name')} placeholder="Jordan Lee" autoComplete="name" />
        </label>
        <label className="b-field">
          <span className="b-lbl">Cell phone (optional)</span>
          <input
            className="b-in" type="tel" value={form.phone}
            // The calls-and-texts box is about a number. When the number goes, so does a tick in it: it must
            // never come back already ticked beside a different number.
            onChange={(event) => {
              const phone = event.target.value;
              setForm((prev) => ({ ...prev, phone, consent: (phone.match(/\d/g) || []).length >= 7 ? prev.consent : false }));
            }}
            placeholder="(801) 555-0100" autoComplete="tel" inputMode="tel"
          />
        </label>
        <label className="b-field">
          <span className="b-lbl">Email</span>
          <input
            className="b-in" type="email" value={form.email} onChange={set('email')}
            placeholder="you@email.com" autoComplete="email" inputMode="email"
          />
        </label>
      </div>
      {/*
        The privacy box is required to get in, and it is one of two ways in: ticked, calls and texts are
        agreed to as well when there is a number; unticked, the email-only terms come up and accepting
        those (no calls, no texts) gets them in too. So agreeing to calls and texts is never the price of
        getting in, which a number given under duress would make it.
      */}
      <label
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, padding: '12px 14px',
            borderRadius: 'var(--t-rad)', background: 'var(--t-tint)',
            border: '1px solid var(--t-line)', cursor: 'pointer',
          }}
        >
          {/* Ticked, the browser fills the box in the text-safe accent: the accent fill can be under 3:1 on the tint. */}
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(event) => setForm((prev) => ({ ...prev, consent: event.target.checked }))}
            style={{ marginTop: 2, width: 18, height: 18, flex: 'none', accentColor: 'var(--t-accT)' }}
          />
          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--t-ink)' }}>
            {privacyBoxText(who, hasPhone)}
          </span>
        </label>

      {error ? <p role="alert" style={{ color: 'var(--t-accT)', fontSize: 12.5, margin: '10px 0 0' }}>{error}</p> : null}
      <button type="submit" className="b-btn" disabled={busy} style={{ marginTop: 16, minHeight: 50 }}>
        {busy ? 'One moment…' : isListing ? 'See the home' : `Start exploring ${community?.name}`}
      </button>
      <LimitedPrivacy
        open={askLimited} text={limitedPrivacyText(who)} busy={busy}
        onAgree={() => enterWith('email_only')} onBack={() => setAskLimited(false)}
      />
    </form>
  );
}

/**
 * The email-only terms: what comes up when the privacy box is left unticked. Accepting is the other way in
 * (no calls, no texts); going back returns to the box. Closing it (Escape, a tap outside) is going back,
 * never getting in.
 */
function LimitedPrivacy({ open, text, busy, onAgree, onBack }) {
  const ref = useRef(null);
  useDialog(open, onBack, ref);
  if (!open) return null;
  return (
    <div ref={ref} className="b-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Email-only privacy terms" {...closeOnBackdrop(onBack)}>
      <div className="b-sheet">
        <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>Privacy terms</span>
        <h2 className="b-head" style={{ fontSize: 20, margin: '4px 0 8px' }}>Email only: no calls, no texts</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '0 0 16px' }}>{text}</p>
        <div className="b-stack" style={{ gap: 8 }}>
          <button type="button" className="b-btn" onClick={onAgree} disabled={busy} style={{ minHeight: 48 }}>
            {busy ? 'One moment…' : 'I agree, continue'}
          </button>
          <button type="button" className="b-btn b-btn-outline" onClick={onBack} disabled={busy} style={{ minHeight: 46 }}>
            Go back and tick the privacy box
          </button>
        </div>
      </div>
    </div>
  );
}
