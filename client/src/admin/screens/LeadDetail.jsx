import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  formatSlotDate, leaseOverlap, MOVE_IN_DRIVERS, moveInTimeline, PLAN_LABELS, TOOL_KEYS,
  describeTour, isTourPending, planProgress,
} from '@shared/domain.js';
import { ChevronLeft } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { money, shortDate } from '../../lib/format.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, Spinner } from '../ui.jsx';

export default function LeadDetail({ community, reload }) {
  const { token } = useAdmin();
  const { communityId, leadId } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const downloadMismo = async () => {
    setDownloading(true);
    setError('');
    try {
      await adminApi.downloadLeadMismo(token, leadId);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    adminApi
      .lead(token, leadId)
      .then((data) => {
        setLead(data);
        setNotes(data.notes);
      })
      .catch((err) => setError(err.message));
  }, [leadId, token]);

  if (error && !lead) return <div className="a-shell"><ErrorNote>{error}</ErrorNote></div>;
  if (!lead) return <div className="a-shell"><Spinner /></div>;

  const savedHomes = lead.savedHomeIds.map((id) => community.homes.find((h) => h.id === id)).filter(Boolean);
  const planItems = TOOL_KEYS.filter((key) => lead.plan[key]).map((key) => ({ key, summary: lead.plan[key] }));

  /**
   * Every change here has to be pushed back to the list this screen was opened
   * from. That list is loaded once by CommunityDetail, so without this you mark
   * somebody contacted, go back, and they still look untouched — the save
   * worked, the list was just showing a snapshot.
   */
  const apply = async (patch) => {
    setLead(await adminApi.updateLead(token, lead.id, patch));
    await reload?.();
  };

  const toggleTourHandled = () => apply({ tourHandled: !lead.tour?.handledAt });

  const toggleStatus = () => apply({ status: lead.status === 'new' ? 'contacted' : 'new' });

  const toggleArchived = async () => {
    if (!lead.archivedAt && !window.confirm(`Archive ${lead.name}? They leave your active list but nothing is deleted.`)) return;
    await apply({ archived: !lead.archivedAt });
  };

  const saveNotes = async () => {
    setError('');
    try {
      await adminApi.updateLead(token, lead.id, { notes });
      await reload?.();
      setNotesSaved(true);
      window.setTimeout(() => setNotesSaved(false), 1800);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="a-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          type="button" className="btn btn-secondary btn-icon" aria-label="Back"
          onClick={() => navigate(`/admin/communities/${communityId}?tab=leads`)}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 21 }}>{lead.name}</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>
            First visit {shortDate(lead.firstVisitAt)} · plan {planProgress(lead)}% complete
          </span>
        </div>
        <span className={lead.status === 'new' ? 'tag tag-accent' : 'tag tag-neutral'}>
          {lead.status === 'new' ? 'New' : 'Contacted'}
        </span>
      </div>

      {lead.tour ? (
        <div
          className="card elev-sm"
          style={{
            marginBottom: 12,
            background: isTourPending(lead) ? 'var(--color-accent-100)' : 'var(--color-neutral-200)',
            border: isTourPending(lead) ? '1px solid var(--color-accent)' : '1px solid var(--color-divider)',
          }}
        >
          <span className="card-kicker">
            {isTourPending(lead) ? '📞 Waiting for a call' : 'Call request — handled'}
          </span>
          <span style={{ fontWeight: 600 }}>{describeTour(lead.tour)}</span>
          {lead.tour.requestedAt ? (
            <span className="text-muted" style={{ fontSize: 12 }}>Asked {shortDate(lead.tour.requestedAt)}</span>
          ) : null}
          {lead.tour.handledAt ? (
            <span className="text-muted" style={{ fontSize: 12 }}>Handled {shortDate(lead.tour.handledAt)}</span>
          ) : null}
          <button
            type="button"
            className={isTourPending(lead) ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={toggleTourHandled}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          >
            {isTourPending(lead) ? 'Mark handled' : 'Reopen request'}
          </button>
        </div>
      ) : null}

      {lead.archivedAt ? (
        <div
          className="card elev-sm"
          style={{ gap: 6, marginBottom: 12, borderColor: 'var(--color-divider)' }}
        >
          <span className="card-kicker">Archived</span>
          <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Filed away {shortDate(lead.archivedAt)}. They are out of your active list and no longer
            counted as waiting for a call. Nothing has been deleted.
          </span>
          <button type="button" className="btn btn-primary" onClick={toggleArchived} style={{ alignSelf: 'flex-start' }}>
            Bring back to active
          </button>
        </div>
      ) : null}

      <div className="card elev-sm" style={{ gap: 8, marginBottom: 12 }}>
        <span className="card-kicker">Contact</span>
        <div style={{ fontSize: 14 }}>{lead.email}</div>
        <div style={{ fontSize: 14 }}>{lead.phone}</div>
        <ConsentNote consent={lead.consent} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <a className="btn btn-primary" href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>Call</a>
          <a className="btn btn-secondary" href={`mailto:${lead.email}`}>Email</a>
          <button type="button" className="btn btn-ghost" onClick={toggleStatus}>
            {lead.status === 'new' ? 'Mark contacted' : 'Mark not contacted'}
          </button>
        </div>
      </div>

      <div className="card" style={{ gap: 8, marginBottom: 12 }}>
        <span className="card-kicker">Homes they like</span>
        {savedHomes.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 13 }}>No homes saved yet.</span>
        ) : null}
        {savedHomes.map((home) => (
          <div key={home.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
            <span>★ {home.name}</span>
            <span className="text-muted">{money(home.price)}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ gap: 10, marginBottom: 12 }}>
        <span className="card-kicker">Their home plan so far</span>
        {planItems.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 13 }}>Hasn&apos;t used any tools yet.</span>
        ) : null}
        {planItems.map((item) => (
          <div key={item.key}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{PLAN_LABELS[item.key]}</div>
            <div className="text-muted" style={{ fontSize: 13 }}>{item.summary}</div>
          </div>
        ))}
      </div>

      <MoveInCard lead={lead} homes={community.homes} />

      <div className="card" style={{ gap: 8, marginBottom: 12 }}>
        <span className="card-kicker">Activity log</span>
        {lead.activity.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 13 }}>No activity yet.</span>
        ) : null}
        {lead.activity.slice(0, 10).map((entry, index) => (
          <div key={`${entry.createdAt}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)', flex: 'none' }}
            />
            <span style={{ flex: 1 }}>{entry.text}</span>
            <span className="text-muted" style={{ fontSize: 11.5, flex: 'none' }}>{shortDate(entry.createdAt)}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ gap: 8 }}>
        <span className="card-kicker">Notes</span>
        <textarea
          className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. Prefers a corner lot, call after 5pm"
        />
        <ErrorNote>{error}</ErrorNote>
        <button
          type="button" className="btn btn-secondary" onClick={saveNotes}
          disabled={notes === lead.notes} style={{ alignSelf: 'flex-start' }}
        >
          {notesSaved ? 'Saved ✓' : 'Save notes'}
        </button>
      </div>
      <div className="card elev-sm" style={{ gap: 8 }}>
        <span className="card-kicker">Hand off to a lender</span>
        <p className="card-body" style={{ margin: 0 }}>
          A MISMO 3.4 file your LOS can import, so nobody retypes this buyer.
          Their name, phone, email, the home they are looking at and their move-in
          plan — not income, assets or credit, which this app never collects.
        </p>
        <button
          type="button" className="btn btn-secondary" onClick={downloadMismo}
          disabled={downloading} style={{ alignSelf: 'flex-start' }}
        >
          {downloading ? 'Building…' : 'Download 3.4 file'}
        </button>
      </div>

    {!lead.archivedAt ? (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={toggleArchived}
          style={{ marginTop: 4, color: 'var(--color-neutral-700)' }}
        >
          Archive this lead
        </button>
      ) : null}
    </div>
  );
}

/**
 * What the buyer is actually working towards. Worth its own card: "you want to
 * be in before the school year and your lease ends in March" is a different
 * sales call from "here are some homes".
 */
function MoveInCard({ lead, homes }) {
  const plan = lead.moveIn;
  if (!plan?.targetDate && !plan?.ownSteps?.length) return null;

  const home = homes.find((h) => h.id === plan.homeId) || null;
  const timeline = moveInTimeline(plan, { home });
  const overlap = plan.leaseEnd ? leaseOverlap(plan.leaseEnd, timeline.keys) : null;
  const drivers = MOVE_IN_DRIVERS.filter((d) => (plan.drivers || []).includes(d.k));
  const done = timeline.items.filter((i) => i.done).length;

  return (
    <div className="card" style={{ gap: 10, marginBottom: 12 }}>
      <span className="card-kicker">Their move-in plan</span>
      {plan.targetDate ? (
        <div style={{ fontSize: 14 }}>
          Wants to be in by <strong>{formatSlotDate(plan.targetDate)}</strong>
          {home ? ` · ${home.name}` : ''}
          {plan.payMethod === 'cash' ? ' · paying cash' : ''}
        </div>
      ) : null}
      {timeline.keys && !timeline.feasible ? (
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          That is earlier than this home can close — earliest is {formatSlotDate(timeline.earliest)}.
        </div>
      ) : null}
      {overlap && overlap.kind !== 'same' ? (
        <div className="text-muted" style={{ fontSize: 13 }}>
          Lease ends {formatSlotDate(plan.leaseEnd)} — {Math.abs(overlap.days)} days{' '}
          {overlap.kind === 'overlap' ? 'of overlap' : 'short'}.
        </div>
      ) : null}
      {drivers.length ? (
        <div className="text-muted" style={{ fontSize: 13 }}>
          Driving it: {drivers.map((d) => d.label).join(', ')}
        </div>
      ) : null}
      {plan.ownSteps?.length ? (
        <div className="text-muted" style={{ fontSize: 13 }}>
          Added themselves: {plan.ownSteps.map((s) => s.label).join(', ')}
        </div>
      ) : null}
      {timeline.items.length ? (
        <div className="text-muted" style={{ fontSize: 13 }}>
          {done} of {timeline.items.length} steps ticked off.
        </div>
      ) : null}
    </div>
  );
}

/**
 * Whether this person agreed to be called, in the one place somebody looks
 * before they dial.
 *
 * Three states, not two. Agreed shows the words they saw and when, because that
 * paragraph is the whole defence if the call is ever questioned. Declined means
 * they were asked and said no. No record at all means they signed up before the
 * box existed -- also do not call, but for a different reason, and worth telling
 * apart when deciding what to do about the older leads.
 */
function ConsentNote({ consent }) {
  const [open, setOpen] = useState(false);
  const stamp = consent?.at ? new Date(consent.at).toLocaleString() : '';

  if (!consent || !consent.granted) {
    return (
      <div
        style={{
          padding: '9px 11px', borderRadius: 8, background: '#fdecea', color: '#8a1c11',
          fontSize: 12.5, lineHeight: 1.45,
        }}
      >
        <strong>Do not call or text.</strong>{' '}
        {consent
          ? `They were asked on ${stamp} and left the box unchecked.`
          : 'No consent on file — this lead predates the consent box.'}{' '}
        Replying to something they asked for is fine; marketing calls and texts are not.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '9px 11px', borderRadius: 8, background: '#e9f7ef', color: '#1b5e37',
        fontSize: 12.5, lineHeight: 1.45,
      }}
    >
      <strong>Agreed to calls and texts</strong> on {stamp}.{' '}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
          textDecoration: 'underline', cursor: 'pointer',
        }}
      >
        {open ? 'Hide' : 'Show'} what they agreed to
      </button>
      {open ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, fontStyle: 'italic' }}>
          &ldquo;{consent.text}&rdquo;
          <br />
          <span style={{ fontStyle: 'normal', opacity: 0.8 }}>
            Wording {consent.version}{consent.ip ? ` · from ${consent.ip}` : ''}
          </span>
        </p>
      ) : null}
    </div>
  );
}
