import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../BuyerContext.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lead capture. Nothing past this point works without a lead record. */
export default function Gate({ onEntered }) {
  const { community, enter } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const digits = (form.phone.match(/\d/g) || []).length;
    if (!form.name.trim() || !EMAIL_RE.test(form.email) || digits < 7) {
      setError('Please add your full name, a valid email and a cell number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await enter({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
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
    <form className="b-shell" onSubmit={submit} style={{ paddingTop: 'calc(28px + env(safe-area-inset-top))' }}>
      <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>Almost there</span>
      <h2 className="b-head" style={{ margin: '4px 0 8px', fontSize: 27 }}>Let&apos;s introduce you</h2>
      <p style={{ margin: '0 0 18px', color: 'var(--t-mut)', fontSize: 13.5, lineHeight: 1.5 }}>
        Tell us who you are to open the {community?.name} app. The team may reach out to help with anything you save.
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
          <span className="b-lbl">Cell phone</span>
          <input
            className="b-in" type="tel" value={form.phone} onChange={set('phone')}
            placeholder="(801) 555-0100" autoComplete="tel" inputMode="tel"
          />
        </label>
      </div>
      {error ? <p style={{ color: 'var(--t-accT)', fontSize: 12.5, margin: '10px 0 0' }}>{error}</p> : null}
      <button type="submit" className="b-btn" disabled={busy} style={{ marginTop: 16, minHeight: 50 }}>
        {busy ? 'One moment…' : `Start exploring ${community?.name}`}
      </button>
      <p style={{ fontSize: 11, color: 'var(--t-mut)', margin: '10px 0 0', textAlign: 'center' }}>
        All three are required. Your info goes only to the {community?.name} team.
      </p>
    </form>
  );
}
