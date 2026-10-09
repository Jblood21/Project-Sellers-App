import { useCallback, useEffect, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { COMMUNITY_STATUSES, normalizeCommunitySlug } from '@shared/domain.js';
import { ChevronLeft, Pencil, QrIcon } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import AreaTab from '../tabs/AreaTab.jsx';
import AvailabilityTab from '../tabs/AvailabilityTab.jsx';
import HomesTab from '../tabs/HomesTab.jsx';
import LeadsTab from '../tabs/LeadsTab.jsx';
import LearnTab from '../tabs/LearnTab.jsx';
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
  ['learn', 'Learn'],
  ['times', 'Times'],
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
    // Handed back so a caller can show what was really stored, not what it sent.
    return next;
  }, [communityId, token]);

  useEffect(() => {
    reload().catch((err) => setError(err.message));
  }, [reload]);

  if (error) return <div className="a-shell"><ErrorNote>{error}</ErrorNote></div>;
  if (!community) return <div className="a-shell"><Spinner /></div>;

  return (
    <Routes>
      <Route index element={<CommunityTabs community={community} leads={leads} reload={reload} />} />
      <Route path="leads/:leadId" element={<LeadDetail community={community} reload={reload} />} />
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

  // SetupTab keeps this true while its form holds edits that are not saved yet.
  const setupDirty = useRef(false);
  const leaveSetupOk = () => !setupDirty.current
    || window.confirm('You have unsaved changes on the Setup tab. Leave and lose them?');

  const setTab = (next) => {
    if (next !== tab && !leaveSetupOk()) return;
    setSearchParams(next === 'homes' ? {} : { tab: next }, { replace: true });
  };

  // The row scrolls sideways on a phone. Bring the active pill into view so the
  // person can see which section they are in; the row is scrolled directly,
  // because scrollIntoView could also move the whole page.
  const tabRow = useRef(null);
  useEffect(() => {
    const row = tabRow.current;
    const pill = row?.querySelector('[aria-pressed="true"]');
    if (!row || !pill) return;
    const r = row.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    row.scrollLeft += p.left - r.left - (r.width - p.width) / 2;
  }, [tab]);

  return (
    <div className="a-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button" className="btn btn-secondary btn-icon" aria-label="Back to communities"
          onClick={() => leaveSetupOk() && navigate('/admin')}
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

      {/* Eight tabs do not fit a 390px phone at their natural width, so the row scrolls
          sideways instead of widening the whole page. */}
      <div ref={tabRow} className="scroll-x" role="group" aria-label="Sections" style={{ display: 'flex', gap: 5, margin: '16px 0 18px', overflowX: 'auto' }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            style={{
              flex: '1 0 auto', minHeight: 44, whiteSpace: 'nowrap', borderRadius: 999,
              border: '1px solid var(--color-divider)', cursor: 'pointer', padding: '0 14px',
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
      {tab === 'learn' ? <LearnTab community={community} reload={reload} /> : null}
      {tab === 'times' ? <AvailabilityTab community={community} reload={reload} /> : null}
      {tab === 'tools' ? <ToolsTab community={community} reload={reload} /> : null}
      {tab === 'leads' ? <LeadsTab community={community} leads={leads} /> : null}
      {tab === 'stats' ? <StatsTab community={community} leads={leads} /> : null}
      {tab === 'setup' ? <SetupTab community={community} reload={reload} dirtyRef={setupDirty} /> : null}

      {qrOpen ? (
        <QrDialog
          community={community}
          onClose={() => setQrOpen(false)}
          onOpenFlyer={() => {
            if (!leaveSetupOk()) return;
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

/** The buyer link: the address on the sign, without the random letters the community's id carries. */
function BuyerLinkField({ community, value, onChange }) {
  const origin = community.siteOrigin || window.location.origin;
  const cleaned = normalizeCommunitySlug(value);
  const typed = value.trim().length > 0;
  const suggestion = community.suggestedSlug;
  return (
    <div className="field">
      <label htmlFor="buyer-link">Buyer link</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="text-muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{origin.replace(/^https?:\/\//, '')}/c/</span>
        <input
          id="buyer-link" className="input" value={value} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(event) => onChange(event.target.value)} aria-describedby="buyer-link-note"
          placeholder={suggestion}
        />
      </div>
      <span id="buyer-link-note" className="field-hint">
        {!community.slug && suggestion ? (
          <>
            This community is still on its original link ({community.id}).{' '}
            <button type="button" className="btn btn-secondary" style={{ minHeight: 30, padding: '0 10px' }} onClick={() => onChange(suggestion)}>
              Use {suggestion}
            </button>{' '}
          </>
        ) : null}
        {typed && !cleaned
          ? 'Use 3 to 40 letters, numbers or hyphens. Words the site uses itself, like admin, are not allowed.'
          : `${origin}/c/${cleaned || community.urlKey}. Every earlier link and printed code keeps working${community.formerSlugs?.length ? `, including /c/${[community.id, ...community.formerSlugs].join(', /c/')}` : `, including /c/${community.id}`}.`}
      </span>
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
    slug: community.slug ?? '',
  });
  const [heroDataUrl, setHeroDataUrl] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // A blank link is not a request to remove it: a community always has an address.
      const { slug, ...rest } = form;
      await adminApi.updateCommunity(token, community.id, slug.trim() ? { ...rest, slug } : rest);
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
      <BuyerLinkField
        community={community}
        value={form.slug}
        onChange={(slug) => setForm((f) => ({ ...f, slug }))}
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
