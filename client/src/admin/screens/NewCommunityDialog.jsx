import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import { Dialog, ErrorNote, TextField } from '../ui.jsx';

/** Name a new community (and optionally give it a photo), then open it. */
export default function NewCommunityDialog({ onClose }) {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', location: '', builder: '' });
  const [heroDataUrl, setHeroDataUrl] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await adminApi.createCommunity(token, form);
      // The photo endpoint needs a community id, so it can only go up now that
      // the community exists. A failure here must not lose the community.
      if (heroDataUrl) {
        try {
          await adminApi.addCommunityPhoto(token, created.id, 'hero', { dataUrl: heroDataUrl });
        } catch (photoErr) {
          setError(`${created.name} was created, but the photo did not upload: ${photoErr.message}`);
        }
      }
      onClose();
      navigate(`/admin/communities/${created.id}/homes`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="New community"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <TextField
        label="Community name" value={form.name}
        onChange={(name) => setForm((f) => ({ ...f, name }))} placeholder="e.g. Maple Bend"
      />
      <TextField
        label="Location" value={form.location}
        onChange={(location) => setForm((f) => ({ ...f, location }))} placeholder="City, State"
      />
      <TextField
        label="Builder name" value={form.builder}
        onChange={(builder) => setForm((f) => ({ ...f, builder }))} placeholder="e.g. Hearthside Homes"
      />
      <PhotoPicker
        label="Community photo"
        hint="Tap to upload — buyers see this first when they scan the sign"
        pendingDataUrl={heroDataUrl}
        onPick={setHeroDataUrl}
      />
      <ErrorNote>{error}</ErrorNote>
    </Dialog>
  );
}
