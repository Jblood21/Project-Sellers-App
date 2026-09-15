import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { THEMES } from '@shared/domain.js';
import CardButton from '../../components/CardButton.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import Wordmark from '../Wordmark.jsx';
import { Dialog, ErrorNote, Spinner, TextField } from '../ui.jsx';

export default function Communities() {
  const { token, admin, signOut } = useAdmin();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', builder: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.communities(token).then(setCommunities).catch((err) => setError(err.message));
  }, [token]);

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await adminApi.createCommunity(token, form);
      setDialogOpen(false);
      setForm({ name: '', location: '', builder: '' });
      navigate(`/admin/communities/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="a-shell">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-accent)' }}>
            <Wordmark size={19} />
            <span className="card-kicker" style={{ color: 'var(--color-neutral-600)' }}>
              {admin?.email}
            </span>
          </span>
          <h2 style={{ margin: '4px 0 6px', fontSize: 28 }}>Communities</h2>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            Each community gets its own QR code, theme, tools and lead list.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {communities === null ? (
        <Spinner />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '18px 0' }}>
          {communities.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              No communities yet — create your first one to generate its QR code.
            </p>
          ) : null}
          {communities.map((community) => (
            <CardButton
              key={community.id}
              onClick={() => navigate(`/admin/communities/${community.id}`)}
              label={`Open ${community.name}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="card-title" style={{ fontSize: 20 }}>{community.name}</span>
                <span className="tag tag-accent-2">{community.status}</span>
              </div>
              <span className="text-muted" style={{ fontSize: 13 }}>{community.location}</span>
              <div className="card-meta">
                {community.homesCount} homes · {community.leadsCount} leads · {THEMES[community.theme]} theme
              </div>
            </CardButton>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-primary btn-block" onClick={() => setDialogOpen(true)} style={{ minHeight: 46 }}>
        ＋ New community
      </button>

      {dialogOpen ? (
        <Dialog
          title="New community"
          onClose={() => setDialogOpen(false)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>Create</button>
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
          <ErrorNote>{error}</ErrorNote>
        </Dialog>
      ) : null}
    </div>
  );
}
