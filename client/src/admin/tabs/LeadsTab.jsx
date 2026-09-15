import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { planProgress } from '@shared/domain.js';
import CardButton from '../../components/CardButton.jsx';
import { shortDate } from '../../lib/format.js';
import { PillRow, Spinner } from '../ui.jsx';

export default function LeadsTab({ community, leads }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');

  const rows = useMemo(() => {
    if (!leads) return [];
    let out = [...leads];
    if (filter !== 'all') out = out.filter((lead) => lead.status === filter);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((lead) => `${lead.name} ${lead.email} ${lead.phone}`.toLowerCase().includes(q));
    if (sort === 'stars') out.sort((a, b) => b.savedHomeIds.length - a.savedHomeIds.length);
    else out.reverse();
    return out;
  }, [filter, leads, query, sort]);

  if (!leads) return <Spinner label="Loading leads…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            { value: 'all', label: 'All' },
            { value: 'new', label: 'New' },
            { value: 'contacted', label: 'Contacted' },
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
        <p className="text-muted" style={{ fontSize: 13 }}>No leads match that search or filter.</p>
      ) : null}

      {rows.map((lead) => (
        <CardButton
          key={lead.id}
          onClick={() => navigate(`/admin/communities/${community.id}/leads/${lead.id}`)}
          label={`Open ${lead.name}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-title" style={{ fontSize: 17, flex: 1, minWidth: 0 }}>{lead.name}</span>
            <span className={lead.status === 'new' ? 'tag tag-accent' : 'tag tag-neutral'}>
              {lead.status === 'new' ? 'New' : 'Contacted'}
            </span>
          </div>
          <span className="text-muted" style={{ fontSize: 12.5 }}>{lead.phone} · {lead.email}</span>
          <div className="card-meta">
            Plan {planProgress(lead)}% · ★ {lead.savedHomeIds.length} saved · {lead.activityCount ?? 0} actions ·{' '}
            {shortDate(lead.firstVisitAt)}
          </div>
        </CardButton>
      ))}
    </div>
  );
}
