import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  countPendingTours, describeTour, isArchived, isTourPending, isUnread, planProgress,
} from '@shared/domain.js';
import CardButton from '../../components/CardButton.jsx';
import { shortDate } from '../../lib/format.js';
import { PillRow, Spinner } from '../ui.jsx';

export default function LeadsTab({ community, leads }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [sort, setSort] = useState('recent');

  const rows = useMemo(() => {
    if (!leads) return [];
    // Every view except "Closed" hides archived leads — that is what archiving is
    // for. Closed shows only those, so nothing is ever unreachable.
    let out = filter === 'closed' ? leads.filter(isArchived) : leads.filter((l) => !isArchived(l));
    if (filter === 'unread') out = out.filter(isUnread);
    else if (filter === 'tour') out = out.filter(isTourPending);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((lead) => `${lead.name} ${lead.email} ${lead.phone}`.toLowerCase().includes(q));
    if (sort === 'stars') out.sort((a, b) => b.savedHomeIds.length - a.savedHomeIds.length);
    else out.reverse();
    return out;
  }, [filter, leads, query, sort]);

  if (!leads) return <Spinner label="Loading leads…" />;

  const pendingTours = countPendingTours(leads);
  // Pills that would only ever read zero are not shown at all — an empty filter
  // is one more thing to scan past for no information.
  const unread = leads.filter((lead) => isUnread(lead) && !isArchived(lead)).length;
  const archived = leads.filter(isArchived).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pendingTours > 0 ? (
        <button
          type="button"
          onClick={() => setFilter('tour')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
            background: 'var(--color-accent-100)', border: '1px solid var(--color-accent)',
            color: 'var(--color-accent-700)', fontFamily: 'var(--font-heading)', fontWeight: 700,
            fontSize: 13.5,
          }}
        >
          <span aria-hidden="true">📞</span>
          <span style={{ flex: 1 }}>
            {pendingTours === 1
              ? '1 person is waiting for a call'
              : `${pendingTours} people are waiting for a call`}
          </span>
          <span style={{ fontWeight: 600, opacity: 0.8 }}>
            {filter === 'tour' ? 'Showing' : 'Show →'}
          </span>
        </button>
      ) : null}
      {leads.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          No leads yet — post the QR sign. Anyone who enters the app leaves their name, email and phone.
        </p>
      ) : null}

      <input
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, email or phone"
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <PillRow
          label="Filter leads"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'Active' },
            ...(unread ? [{ value: 'unread', label: `Unread ${unread}` }] : []),
            ...(pendingTours ? [{ value: 'tour', label: `📞 ${pendingTours}` }] : []),
            ...(archived ? [{ value: 'closed', label: `Closed ${archived}` }] : []),
          ]}
        />
        <PillRow
          label="Sort leads"
          value={sort}
          onChange={setSort}
          options={[{ value: 'recent', label: 'Recent' }, { value: 'stars', label: 'Most ★' }]}
        />
      </div>

      {leads.length > 0 && rows.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          {filter === 'active' && archived === leads.length
            ? 'Every lead is archived. Tap Closed to see them.'
            : 'No leads match that search or filter.'}
        </p>
      ) : null}

      {rows.map((lead) => (
        <CardButton
          key={lead.id}
          onClick={() => navigate(`/admin/communities/${community.id}/leads/${lead.id}`)}
          label={`Open ${lead.name}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-title" style={{ fontSize: 17, flex: 1, minWidth: 0 }}>{lead.name}</span>
            {isTourPending(lead) ? (
              <span className="tag tag-accent" style={{ background: 'var(--color-accent)', color: '#fff' }}>
                📞 {describeTour(lead.tour)}
              </span>
            ) : null}
            {isUnread(lead) ? <span className="tag tag-accent">Unread</span> : null}
            {lead.status === 'contacted' ? <span className="tag tag-neutral">Contacted</span> : null}
            {isArchived(lead) ? <span className="tag tag-neutral">Archived</span> : null}
          </div>
          <span className="text-muted" style={{ fontSize: 12.5 }}>{lead.phone} · {lead.email}</span>
          {/*
            Next to the phone number, because that is where somebody's eye goes
            before they dial. A consent record filed away where nobody reads it
            does not stop the call that costs $500.
          */}
          {lead.consent?.granted ? null : (
            <span
              className="tag tag-neutral"
              style={{ alignSelf: 'flex-start', background: 'var(--color-danger-100, #fdecea)', color: '#8a1c11' }}
            >
              Do not call · {lead.consent ? 'declined' : 'never asked'}
            </span>
          )}
          <div className="card-meta">
            Plan {planProgress(lead)}% · ★ {lead.savedHomeIds.length} saved · {lead.activityCount ?? 0} actions ·{' '}
            {shortDate(lead.firstVisitAt)}
          </div>
        </CardButton>
      ))}
    </div>
  );
}
