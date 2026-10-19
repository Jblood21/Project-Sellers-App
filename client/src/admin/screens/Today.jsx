import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { telHref } from '@shared/compliance.js';
import { THEMES } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { emailHref } from '../../lib/contact.js';
import { useAdmin } from '../AdminContext.jsx';
import AdminShell from '../shell/AdminShell.jsx';
import NavIcon from '../shell/navIcons.jsx';
import { ErrorNote, Spinner } from '../ui.jsx';
import NewCommunityDialog from './NewCommunityDialog.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Where the admin opens: what needs a person today, across every community, then the communities.
 * The calls come first because a buyer who asked for a call is the one thing that goes cold.
 */
export default function Today() {
  const { token } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';

  useEffect(() => {
    adminApi.today(token).then(setData).catch((err) => setError(err.message));
  }, [token]);

  const closeNew = () => setParams({}, { replace: true });
  const totals = data?.totals;

  return (
    <AdminShell
      communities={data?.communities ?? []}
      title="Today"
      blurb="What needs a person right now, across every community."
    >
      <ErrorNote>{error}</ErrorNote>
      {!data && !error ? <Spinner /> : null}

      {data ? (
        <>
          <div className="as-tiles">
            <div className={`as-tile${totals.waiting ? ' as-tile--alert' : ''}`}>
              <strong>{totals.waiting}</strong>
              <span>{totals.waiting === 1 ? 'call waiting' : 'calls waiting'}</span>
            </div>
            <div className={`as-tile${totals.overdue ? ' as-tile--warn' : ''}`}>
              <strong>{totals.overdue}</strong>
              <span>past their day</span>
            </div>
            <div className="as-tile">
              <strong>{totals.unread}</strong>
              <span>new, not opened yet</span>
            </div>
            <div className="as-tile">
              <strong>{totals.people}</strong>
              <span>people in {plural(totals.communities, 'community', 'communities')}</span>
            </div>
          </div>

          <h2 className="as-section-title" style={{ marginTop: 0 }}>Calls waiting</h2>
          {data.calls.length === 0 ? (
            <div className="as-empty">
              <strong>Nobody is waiting for a call.</strong>
              <span>When a buyer asks for a time, they show up here.</span>
            </div>
          ) : (
            <ul className="as-calls">
              {data.calls.map((call) => {
                const tel = call.canCall ? telHref(call.phone) : '';
                const mail = emailHref(call.email);
                return (
                  <li key={call.leadId} className={`as-call${call.overdue ? ' as-call--late' : ''}`}>
                    <div className="as-call__main">
                      <span className="as-call__name">{call.name}</span>
                      <span className="as-call__when">
                        {call.overdue ? <span className="as-call__late">Past their day · </span> : null}
                        {call.when}
                      </span>
                      <span className="as-call__where">{call.communityName}</span>
                      {call.phone && !call.canCall ? <span className="as-chip as-chip--stop" style={{ alignSelf: 'flex-start' }}>Do not call or text</span> : null}
                    </div>
                    <div className="as-call__actions">
                      {tel ? <a className="btn btn-primary" href={tel}><NavIcon name="phone" size={16} /> Call</a> : null}
                      {mail ? <a className="btn btn-secondary" href={mail}><NavIcon name="mail" size={16} /> Email</a> : null}
                      <Link className="btn btn-ghost" to={`/admin/communities/${call.communityId}/leads/${call.leadId}`}>Open</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {totals.waiting > data.calls.length ? (
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              Showing the first {data.calls.length} of {totals.waiting}. Open a community to see the rest.
            </p>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '24px 0 10px' }}>
            <h2 className="as-section-title" style={{ margin: 0 }}>Your communities</h2>
            <Link className="btn btn-primary" to="/admin?new=1"><NavIcon name="plus" size={16} /> New community</Link>
          </div>
          {data.communities.length === 0 ? (
            <div className="as-empty">
              <strong>No communities yet.</strong>
              <span>Create your first one to get its QR code, buyer app and lead list.</span>
            </div>
          ) : (
            <div className="as-cards">
              {data.communities.map((community) => (
                <article key={community.id} className="card elev-sm as-community">
                  <div className="as-community__head">
                    <Link className="card-title as-community__name" to={`/admin/communities/${community.id}/leads`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {community.name}
                    </Link>
                    <span className="tag tag-accent-2">{community.status}</span>
                  </div>
                  <span className="text-muted" style={{ fontSize: 13 }}>{community.location || 'Location TBD'}</span>
                  <div className="as-community__stats">
                    {community.waiting ? <span className={`as-chip ${community.overdue ? 'as-chip--late' : 'as-chip--call'}`}>{plural(community.waiting, 'call')} waiting{community.overdue ? ` · ${community.overdue} late` : ''}</span> : null}
                    {community.unread ? <span className="as-chip as-chip--soft">{community.unread} new</span> : null}
                    {!community.waiting && !community.unread ? <span className="as-chip">All caught up</span> : null}
                  </div>
                  <div className="card-meta">
                    {plural(community.homesCount, 'home')} · {plural(community.people, 'person', 'people')} · {THEMES[community.theme]?.name} theme
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <Link className="btn btn-secondary" to={`/admin/communities/${community.id}/leads`}>Leads</Link>
                    <Link className="btn btn-ghost" to={`/admin/communities/${community.id}/homes`}>Homes</Link>
                    <Link className="btn btn-ghost" to={`/admin/communities/${community.id}/setup`}>Setup</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {creating ? <NewCommunityDialog onClose={closeNew} /> : null}
    </AdminShell>
  );
}
