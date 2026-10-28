import { useEffect, useState } from 'react';

import { PROFILE_TEXT_MAX } from '@shared/agentProfile.js';
import { adminApi } from '../../lib/api.js';
import { fileToDataUrl } from '../../lib/photos.js';
import { useAdmin } from '../AdminContext.jsx';
import ImageSlot from '../setup/ImageSlot.jsx';
import AdminShell from '../shell/AdminShell.jsx';
import SavedLenders from './SavedLenders.jsx';
import { ErrorNote, Spinner, TextField, useSaving, SaveNote } from '../ui.jsx';

// A portrait is shown at most 110 px square, so it is kept smaller than a photo.
export const readPortrait = (file) => fileToDataUrl(file, { kind: 'portrait' });

/**
 * "Your details": the agent's own name, number, email, brokerage and licence line, and their face. They are kept on the
 * account, so every listing starts filled in from them (New listing reads them, and the listing's agent card is made
 * from them). Changing them here does not rewrite listings already made: each listing's own agent card is edited
 * under that listing's Setup.
 */
export default function Profile() {
  const { token } = useAdmin();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const saver = useSaving();

  useEffect(() => {
    let live = true;
    adminApi.myProfile(token).then((p) => {
      if (!live) return;
      setProfile(p);
      setForm({ name: p.name, phone: p.phone, email: p.email, brokerage: p.brokerage, license: p.license });
    }, (err) => live && setError(err.message));
    return () => { live = false; };
  }, [token]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const save = (event) => {
    event?.preventDefault?.();
    return saver.run(async () => {
      const next = await adminApi.saveMyProfile(token, form);
      setProfile(next);
    });
  };
  const setPhoto = async (photo) => setProfile(await adminApi.saveMyProfile(token, { photo }));

  return (
    <AdminShell title="Your details" blurb="Your name, number and photo start every new listing you make.">
      {!form ? (error ? <ErrorNote>{error}</ErrorNote> : <Spinner />) : (
        <form className="card elev-sm" onSubmit={save} style={{ gap: 12 }}>
          <TextField label="Your name" value={form.name} onChange={set('name')} maxLength={PROFILE_TEXT_MAX.name} autoComplete="name" />
          <TextField
            label="Phone" value={form.phone} onChange={set('phone')} maxLength={PROFILE_TEXT_MAX.phone} type="tel" autoComplete="tel"
            hint="Visitors call or text this number to ask for a showing."
          />
          <TextField label="Email" value={form.email} onChange={set('email')} maxLength={PROFILE_TEXT_MAX.email} type="email" autoComplete="email" />
          <TextField label="Brokerage" value={form.brokerage} onChange={set('brokerage')} maxLength={PROFILE_TEXT_MAX.brokerage} autoComplete="organization" />
          <TextField
            label="License number or line" value={form.license} onChange={set('license')} maxLength={PROFILE_TEXT_MAX.license} placeholder="e.g. Lic. #12345"
            hint="Printed under the home." autoComplete="off"
          />
          <ImageSlot
            label="Your photo" shape="square" image={profile?.photo ?? null} alt="Your photo as saved"
            hint="A clear head-and-shoulders photo of your face: visitors see it above the home's pictures. It is cropped to fill a square."
            read={readPortrait} use="portrait"
            onPick={setPhoto} onRemove={() => setPhoto(null)} removeWarning="Remove your photo?"
          />
          <ErrorNote>{error}</ErrorNote>
          <button type="submit" className="btn btn-primary" aria-disabled={saver.saving || undefined} style={{ minHeight: 46 }}>
            {saver.saving ? 'Saving…' : 'Save my details'}
          </button>
          <SaveNote saver={saver} />
        </form>
      )}
      {form ? <SavedLenders /> : null}
    </AdminShell>
  );
}
