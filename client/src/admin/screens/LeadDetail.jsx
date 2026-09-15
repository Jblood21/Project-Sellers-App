import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PLAN_LABELS, TOOL_KEYS, isTourPending, planProgress } from '@shared/domain.js';
import { ChevronLeft } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { money, shortDate } from '../../lib/format.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, Spinner } from '../ui.jsx';

export default function LeadDetail({ community }) {
  const { token } = useAdmin();
  const { communityId, leadId } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

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

  const toggleTourHandled = async () => {
    setLead(await adminApi.updateLead(token, lead.id, { tourHandled: !lead.tour?.handledAt }));
  };

  const toggleStatus = async () => {
    const next = lead.status === 'new' ? 'contacted' : 'new';
    setLead(await adminApi.updateLead(token, lead.id, { status: next }));
  };

  const saveNotes = async () => {
    setError('');
    try {
      await adminApi.updateLead(token, lead.id, { notes });
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
          <span style={{ fontWeight: 600 }}>{lead.tour.time}</span>
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

      <div className="card elev-sm" style={{ gap: 8, marginBottom: 12 }}>
        <span className="card-kicker">Contact</span>
        <div style={{ fontSize: 14 }}>{lead.email}</div>
        <div style={{ fontSize: 14 }}>{lead.phone}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <a className="btn btn-primary" href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>Call</a>
          <a className="btn btn-secondary" href={`mailto:${lead.email}`}>Email</a>
          <button type="button" className="btn btn-ghost" onClick={toggleStatus}>
            {lead.status === 'new' ? 'Mark contacted' : 'Mark new'}
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
    </div>
  );
}
