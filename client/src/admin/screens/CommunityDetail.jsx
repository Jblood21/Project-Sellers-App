import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { COMMUNITY_STATUSES, normalizeCommunitySlug } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import AdminShell from '../shell/AdminShell.jsx';
import { SECTIONS, sectionOf } from '../shell/sections.js';
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
import QrDialog from './QrDialog.jsx';

/** Loads one community (plus its leads) and shares it with every section and sub-page. */
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

  // Opening a person marks them read on the server; the list was loaded before that, so say so here too.
  const markOpened = useCallback((lead) => {
    setLeads((rows) => (rows ? rows.map((row) => (row.id === lead.id && !row.openedAt ? { ...row, openedAt: lead.openedAt } : row)) : rows));
  }, []);

  if (error) return <div className="a-shell"><ErrorNote>{error}</ErrorNote></div>;
  if (!community) return <div className="a-shell"><Spinner /></div>;

  return (
    <Routes>
      <Route index element={<OldAddress community={community} />} />
      <Route path="flyer" element={<Flyer community={community} />} />
      <Route path="*" element={<CommunityPages community={community} leads={leads} reload={reload} markOpened={markOpened} />} />
    </Routes>
  );
}

/**
 * The community's own address used to be one page with ?tab=leads and the like. Every section has its
 * own address now; a saved link or a bookmark with the old form lands on the same section.
 */
function OldAddress({ community }) {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const target = SECTIONS.some((section) => section.key === tab) ? tab : 'leads';
  return <Navigate to={`/admin/communities/${community.id}/${target}`} replace />;
}

/** The section the address names, inside the frame. Everything the sections share lives here. */
function CommunityPages({ community, leads, reload, markOpened }) {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const rest = (useParams()['*'] ?? '').split('/').filter(Boolean);
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // SetupTab keeps the first true while its form holds edits that are not saved yet; the person panel keeps the
  // second true while its notes box holds text that is not saved. Anything that leaves either page asks first.
  const setupDirty = useRef(false);
  const notesDirty = useRef(false);
  const leaveOk = () => {
    if (setupDirty.current) return window.confirm('You have unsaved changes on the Setup page. Leave and lose them?');
    if (notesDirty.current) return window.confirm('You have notes that are not saved yet. Leave and lose them?');
    return true;
  };

  const section = sectionOf(rest[0]);
  // A new section opens at its top, not wherever the last one was scrolled to. Keyed on the section only, so moving
  // between Setup's parts or picking a person beside the list does not jump the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section?.key]);
  if (!section) return <Navigate to={`/admin/communities/${community.id}/leads`} replace />;
  const go = (path) => navigate(`/admin/communities/${community.id}/${path}`);

  return (
    <AdminShell
      community={community}
      leads={leads}
      section={section.key}
      leaveOk={leaveOk}
      onEdit={() => setEditOpen(true)}
      onQr={() => setQrOpen(true)}
    >
      {section.key === 'homes' ? <HomesTab community={community} reload={reload} /> : null}
      {section.key === 'area' ? <AreaTab community={community} reload={reload} /> : null}
      {section.key === 'learn' ? <LearnTab community={community} reload={reload} /> : null}
      {section.key === 'times' ? <AvailabilityTab community={community} reload={reload} /> : null}
      {section.key === 'tools' ? <ToolsTab community={community} reload={reload} /> : null}
      {section.key === 'leads' ? (
        <LeadsTab
          community={community} leads={leads} reload={reload} leadId={rest[1] ?? ''}
          onOpenSetup={() => go('setup/team')}
          onOpened={markOpened} notesDirtyRef={notesDirty} leaveOk={leaveOk}
        />
      ) : null}
      {section.key === 'stats' ? <StatsTab community={community} leads={leads} /> : null}
      {section.key === 'setup' ? (
        <SetupTab community={community} reload={reload} dirtyRef={setupDirty} part={rest[1] ?? ''} />
      ) : null}

      {qrOpen ? (
        <QrDialog
          community={community}
          onChanged={reload}
          onClose={() => setQrOpen(false)}
          onOpenFlyer={() => {
            if (!leaveOk()) return;
            setQrOpen(false);
            go('flyer');
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
    </AdminShell>
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
          : `${origin}/c/${cleaned || community.urlKey}. Every earlier link and printed code keeps working${community.formerSlugs?.length ? `, including /c/${[community.id, ...community.formerSlugs].join(', /c/')}` : `, including /c/${community.id}`}, and they cannot be turned off. Anyone who types any of them can open the community, so keep a community's details private until you are ready to share them.`}
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
      // A blank link is not a request to remove it: a community always has an address. Said, rather than
      // saved as if it had worked.
      const { slug, ...rest } = form;
      if (community.slug && !slug.trim()) {
        setError('A community always has a buyer link. Type the one you want, or put back the one it had.');
        setBusy(false);
        return;
      }
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
