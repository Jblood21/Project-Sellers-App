import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { COMMUNITY_STATUSES, LISTING_STATUSES, normalizeCommunitySlug } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { isListing, renameListing } from '../listing.js';
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
import { Dialog, ErrorNote, Field, LoadError, PillRow, SaveNote, Spinner, TextField, useSaving } from '../ui.jsx';
import DeleteListingDialog from './DeleteListingDialog.jsx';
import Flyer from './Flyer.jsx';
import QrDialog from './QrDialog.jsx';

/** Loads one community (plus its leads) and shares it with every section and sub-page. */
export default function CommunityDetail() {
  const { token } = useAdmin();
  const { communityId } = useParams();
  const [community, setCommunity] = useState(null);
  const [leads, setLeads] = useState(null);
  // The error the first load ended in (kept whole so the screen can tell a bad signal, worth a Retry, from a refusal).
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  /**
   * Reads the community and, unless `leads: false`, everyone in it again. A switch or a setting never changes the
   * people, and their list is by far the biggest part of the read (hundreds of kilobytes for a community with
   * hundreds of leads), so a save that cannot have touched them asks for the community alone and the page settles
   * sooner on a slow signal.
   */
  const reload = useCallback(async (options) => {
    // Anything but an explicit `leads: false` reads them: some callers hand reload straight on as a handler.
    const withLeads = options?.leads !== false;
    const [next, nextLeads] = await Promise.all([
      adminApi.community(token, communityId),
      withLeads ? adminApi.leads(token, communityId) : null,
    ]);
    setCommunity(next);
    if (withLeads) setLeads(nextLeads);
    // Handed back so a caller can show what was really stored, not what it sent.
    return next;
  }, [communityId, token]);

  const load = useCallback(() => {
    setRetrying(true);
    reload()
      .then(() => setError(null))
      .catch(setError)
      .finally(() => setRetrying(false));
  }, [reload]);

  useEffect(() => {
    load();
  }, [load]);

  // Opening a person marks them read on the server; the list was loaded before that, so say so here too.
  const markOpened = useCallback((lead) => {
    setLeads((rows) => (rows ? rows.map((row) => (row.id === lead.id && !row.openedAt ? { ...row, openedAt: lead.openedAt } : row)) : rows));
  }, []);

  // A refusal reads in the server's own words (a member opening a community that is not theirs: "You don't have
  // access to that community."), with the way back, since this frame has no menu of its own.
  // A bad signal gets a Retry as well; a refusal does not, since asking again would only be refused again.
  if (error && !community) {
    return (
      <div className="a-shell">
        <LoadError error={error} onRetry={load} retrying={retrying}>
          <Link className="btn btn-secondary" to="/admin">Back to Today</Link>
        </LoadError>
      </div>
    );
  }
  if (!community) return <div className="a-shell"><Spinner /></div>;

  return (
    <Routes>
      <Route index element={<OldAddress community={community} />} />
      <Route path="flyer" element={<Flyer community={community} reload={reload} />} />
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
  const { token, isOwner } = useAdmin();
  const navigate = useNavigate();
  const rest = (useParams()['*'] ?? '').split('/').filter(Boolean);
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const listing = isListing(community);

  // SetupTab keeps the first true while its form holds edits that are not saved yet; the person panel keeps the
  // second true while its notes box holds text that is not saved. Anything that leaves either page asks first.
  const setupDirty = useRef(false);
  const notesDirty = useRef(false);
  const leaveOk = () => {
    if (setupDirty.current) return window.confirm('You have unsaved changes on the Setup page. Leave and lose them?');
    if (notesDirty.current) return window.confirm('You have notes that are not saved yet. Leave and lose them?');
    return true;
  };

  const section = sectionOf(rest[0], listing);
  const { hash } = useLocation();
  // A new section opens at its top, not wherever the last one was scrolled to. Keyed on the section only, so moving
  // between Setup's parts or picking a person beside the list does not jump the page. An address that names a place
  // on the page (Today's "Add a photo" opens Setup at #artwork) is scrolled there by the section itself, and this
  // runs after it, so it leaves that one alone.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
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
      {section.key === 'homes' ? <HomesTab community={community} reload={reload} single={listing} /> : null}
      {section.key === 'area' ? <AreaTab community={community} reload={reload} /> : null}
      {section.key === 'learn' ? <LearnTab community={community} reload={reload} /> : null}
      {section.key === 'times' && !listing ? <AvailabilityTab community={community} reload={reload} /> : null}
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
        <SetupTab
          community={community} reload={reload} dirtyRef={setupDirty} part={rest[1] ?? ''}
          visitors={leads?.length ?? null} onDeleteListing={() => setDeleteOpen(true)}
        />
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
          canDelete={isOwner}
          canMove={isOwner}
          onDeleteListing={() => {
            setEditOpen(false);
            setDeleteOpen(true);
          }}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await reload();
          }}
          onDeleted={() => navigate('/admin')}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteListingDialog
          listing={community} visitors={leads?.length ?? null}
          onClose={() => setDeleteOpen(false)} onDeleted={() => navigate('/admin')}
        />
      ) : null}
    </AdminShell>
  );
}

/** The buyer link: the address on the sign, without the random letters the community's id carries. */
function BuyerLinkField({ community, value, onChange }) {
  const noun = isListing(community) ? 'listing' : 'community';
  const origin = community.siteOrigin || window.location.origin;
  const cleaned = normalizeCommunitySlug(value);
  const typed = value.trim().length > 0;
  const suggestion = community.suggestedSlug;
  return (
    <div className="field">
      <label htmlFor="buyer-link">Buyer link</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="text-muted" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{origin.replace(/^https?:\/\//, '')}/c/</span>
        <input
          id="buyer-link" className="input" value={value} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(event) => onChange(event.target.value)} aria-describedby="buyer-link-note"
          placeholder={suggestion}
        />
      </div>
      <span id="buyer-link-note" className="field-hint">
        {!community.slug && suggestion ? (
          <>
            This {noun} is still on its original link ({community.id}).{' '}
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44, padding: '0 10px' }} onClick={() => onChange(suggestion)}>
              Use {suggestion}
            </button>{' '}
          </>
        ) : null}
        {typed && !cleaned
          ? 'Use 3 to 40 letters, numbers or hyphens. Words the site uses itself, like admin, are not allowed.'
          : `${origin}/c/${cleaned || community.urlKey}. Every earlier link and printed code keeps working${community.formerSlugs?.length ? `, including /c/${[community.id, ...community.formerSlugs].join(', /c/')}` : `, including /c/${community.id}`}, and they cannot be turned off. Anyone who types any of them can open the ${noun}, so keep a ${noun}'s details private until you are ready to share them.`}
      </span>
    </div>
  );
}

/**
 * Name, place, builder, link, photo, status and, for the owner, the branch. Deleting is the owner's alone
 * (`canDelete`): a member edits, never removes. So is moving a community between branches (`canMove`): a member
 * sees no Branch field and sends no branchId, which the server would refuse.
 */
function EditCommunityDialog({ community, token, canDelete, canMove = false, onDeleteListing, onClose, onSaved, onDeleted }) {
  if (isListing(community)) {
    return <EditListingDialog community={community} token={token} onDelete={onDeleteListing} onClose={onClose} onSaved={onSaved} />;
  }
  return <EditPlaceDialog community={community} token={token} canDelete={canDelete} canMove={canMove} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />;
}

/**
 * A listing's own edit pop-up: the address (which renames its one home too), the city, who it is listed with, where it
 * stands and its buyer link. Anyone with the listing may delete it, so Delete is here for everyone (it opens the
 * confirmation that says what goes with it).
 */
function EditListingDialog({ community, token, onDelete, onClose, onSaved }) {
  const [form, setForm] = useState({
    address: community.name, city: community.location ?? '', brokerage: community.builder ?? '',
    status: LISTING_STATUSES.includes(community.status) ? community.status : LISTING_STATUSES[1], slug: community.slug ?? '',
  });
  const saver = useSaving();
  const [error, setError] = useState('');
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    setError('');
    if (!form.address.trim()) {
      setError('Give the home an address.');
      return Promise.resolve(false);
    }
    // A blank link is not a request to remove it: a listing always has an address people can type.
    if (community.slug && !form.slug.trim()) {
      setError('A listing always has a buyer link. Type the one you want, or put back the one it had.');
      return Promise.resolve(false);
    }
    return saver.run(async () => {
      const fields = { location: form.city.trim(), builder: form.brokerage.trim(), status: form.status };
      await renameListing(token, community, form.address.trim(), form.slug.trim() ? { ...fields, slug: form.slug } : fields);
      await onSaved();
    });
  };

  return (
    <Dialog
      title="Edit listing"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-danger" onClick={onDelete} style={{ marginRight: 'auto' }}>Delete listing</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} aria-disabled={saver.saving || undefined}>
            {saver.saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <TextField label="Address" value={form.address} onChange={set('address')} />
      <TextField label="City and state" value={form.city} onChange={set('city')} placeholder="e.g. Lehi, UT" />
      <TextField label="Brokerage" value={form.brokerage} onChange={set('brokerage')} />
      <BuyerLinkField community={community} value={form.slug} onChange={set('slug')} />
      <div className="field">
        <span>Status</span>
        <PillRow
          label="Listing status"
          value={form.status}
          onChange={set('status')}
          options={LISTING_STATUSES.map((value) => ({ value, label: value }))}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <SaveNote saver={saver} />
    </Dialog>
  );
}

function EditPlaceDialog({ community, token, canDelete, canMove = false, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({
    name: community.name,
    location: community.location,
    builder: community.builder,
    websiteUrl: community.websiteUrl ?? '',
    status: community.status,
    slug: community.slug ?? '',
    branchId: community.branchId ?? '',
  });
  const [heroDataUrl, setHeroDataUrl] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The branches to pick from, read when the pop-up opens (the owner only; the server refuses them to a member).
  // null until they arrive; while they are on their way the field shows the branch the community is in, if any.
  const [branches, setBranches] = useState(null);

  useEffect(() => {
    if (!canMove) return undefined;
    let cancelled = false;
    adminApi.branches(token).then((list) => !cancelled && setBranches(list ?? [])).catch(() => !cancelled && setBranches([]));
    return () => {
      cancelled = true;
    };
  }, [token, canMove]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // A blank link is not a request to remove it: a community always has an address. Said, rather than
      // saved as if it had worked.
      const { slug, branchId, ...fields } = form;
      if (community.slug && !slug.trim()) {
        setError('A community always has a buyer link. Type the one you want, or put back the one it had.');
        setBusy(false);
        return;
      }
      // The branch goes only from the owner, and None goes as null: "" would be a branch that does not exist.
      const rest = canMove ? { ...fields, branchId: branchId || null } : fields;
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
          {canDelete ? <button type="button" className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button> : null}
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
      {canMove ? (
        <Field label="Branch" hint="The company or group this community belongs to. People in that branch can open it.">
          <select
            className="input" value={form.branchId} disabled={branches === null}
            onChange={(event) => setForm((f) => ({ ...f, branchId: event.target.value }))}
          >
            <option value="">None</option>
            {(branches ?? (community.branchId ? [{ id: community.branchId, name: community.branchName ?? 'Its branch' }] : []))
              .map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </Field>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </Dialog>
  );
}
