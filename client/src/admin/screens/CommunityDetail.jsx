import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { COMMUNITY_STATUSES } from '@shared/domain.js';
import { ChevronLeft, Pencil, QrIcon } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import AreaTab from '../tabs/AreaTab.jsx';
import HomesTab from '../tabs/HomesTab.jsx';
import LeadsTab from '../tabs/LeadsTab.jsx';
import SetupTab from '../tabs/SetupTab.jsx';
import StatsTab from '../tabs/StatsTab.jsx';
import ToolsTab from '../tabs/ToolsTab.jsx';
import { Dialog, ErrorNote, PillRow, Spinner, TextField } from '../ui.jsx';
import Flyer from './Flyer.jsx';
import LeadDetail from './LeadDetail.jsx';
import QrDialog from './QrDialog.jsx';

const TABS = [
  ['homes', 'Homes'],
  ['area', 'Area'],
  ['tools', 'Tools'],
  ['leads', 'Leads'],
  ['stats', 'Stats'],
  ['setup', 'Setup'],
];

/** Loads one community (plus its leads) and shares it with every tab and sub-route. */
export default function CommunityDetail() {
  const { token } = useAdmin();
  const { communityId } = useParams();
  const [community, setCommunity] = useState(null);
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [next, nextLeads] = await Promise.all([
      adminApi.community(token, communityId),
      adminApi.leads(token, communityId),
    ]);
    setCommunity(next);
    setLeads(nextLeads);
  }, [communityId, token]);

  useEffect(() => {
    reload().catch((err) => setError(err.message));
  }, [reload]);

  if (error) return <div className="a-shell"><ErrorNote>{error}</ErrorNote></div>;
  if (!community) return <div className="a-shell"><Spinner /></div>;

  return (
    <Routes>
      <Route index element={<CommunityTabs community={community} leads={leads} reload={reload} />} />
      <Route path="leads/:leadId" element={<LeadDetail community={community} />} />
      <Route path="flyer" element={<Flyer community={community} />} />
    </Routes>
  );
}

function CommunityTabs({ community, leads, reload }) {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === searchParams.get('tab')) ? searchParams.get('tab') : 'homes';
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const setTab = (next) => setSearchParams(next === 'homes' ? {} : { tab: next }, { replace: true });

  return (
    <div className="a-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button" className="btn btn-secondary btn-icon" aria-label="Back to communities"
          onClick={() => navigate('/admin')}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 21 }}>{community.name}</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>{community.location} · {community.status}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Edit community" onClick={() => setEditOpen(true)}>
          <Pencil />
        </button>
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Community QR code" onClick={() => setQrOpen(true)}>
          <QrIcon />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 5, margin: '16px 0 18px' }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            style={{
              flex: 1, minHeight: 38, whiteSpace: 'nowrap', borderRadius: 999,
              border: '1px solid var(--color-divider)', cursor: 'pointer', padding: '0 4px',
              background: tab === key ? 'var(--color-accent)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--color-text)',
              fontFamily: 'var(--font-heading)', fontSize: 12.5, fontWeight: 600,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'homes' ? <HomesTab community={community} reload={reload} /> : null}
      {tab === 'area' ? <AreaTab community={community} reload={reload} /> : null}
      {tab === 'tools' ? <ToolsTab community={community} reload={reload} /> : null}
      {tab === 'leads' ? <LeadsTab community={community} leads={leads} /> : null}
      {tab === 'stats' ? <StatsTab community={community} leads={leads} /> : null}
      {tab === 'setup' ? <SetupTab community={community} reload={reload} /> : null}

      {qrOpen ? (
        <QrDialog
          community={community}
          onClose={() => setQrOpen(false)}
          onOpenFlyer={() => {
            setQrOpen(false);
            navigate(`/admin/communities/${community.id}/flyer`);
          }}
        />
      ) : null}

      {editOpen ? (
        <EditCommunityDialog
          community={community}
          token={token}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await reload();
          }}
          onDeleted={() => navigate('/admin')}
        />
      ) : null}
    </div>
  );
}

function EditCommunityDialog({ community, token, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({
    name: community.name,
    location: community.location,
    builder: community.builder,
    websiteUrl: community.websiteUrl ?? '',
    status: community.status,
  });
  const [heroDataUrl, setHeroDataUrl] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, form);
      // Only sent when a new file was picked, so saving other fields never
      // disturbs the existing photo.
      if (heroDataUrl) {
        await adminApi.addCommunityPhoto(token, community.id, 'hero', { dataUrl: heroDataUrl });
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${community.name}, its homes and every lead? This cannot be undone.`)) return;
    await adminApi.deleteCommunity(token, community.id);
    onDeleted();
  };

  return (
    <Dialog
      title="Edit community"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <TextField label="Community name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
      <TextField label="Location" value={form.location} onChange={(location) => setForm((f) => ({ ...f, location }))} />
      <TextField label="Builder name" value={form.builder} onChange={(builder) => setForm((f) => ({ ...f, builder }))} />
      <TextField
        label="Community website" value={form.websiteUrl}
        onChange={(websiteUrl) => setForm((f) => ({ ...f, websiteUrl }))} placeholder="https://…"
      />
      <PhotoPicker
        label="Community photo"
        hint="Tap to upload — buyers see this first when they scan the sign"
        currentUrl={community.heroPhoto?.url}
        pendingDataUrl={heroDataUrl}
        onPick={setHeroDataUrl}
      />
      <div className="field">
        <span>Status</span>
        <PillRow
          label="Community status"
          value={form.status}
          onChange={(status) => setForm((f) => ({ ...f, status }))}
          options={COMMUNITY_STATUSES.map((value) => ({ value, label: value }))}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Dialog>
  );
}
