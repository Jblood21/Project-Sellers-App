import { useEffect, useRef, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import AdminShell from '../shell/AdminShell.jsx';
import { ErrorNote, Spinner } from '../ui.jsx';
import ActivityRows, { groupByDay } from './ActivityRows.jsx';

const PAGE = 50;

/**
 * What everyone on the team has changed, newest first, for the owner: every community someone made or set up,
 * every home, photo, guide, realtor and lead they touched, with who did it and when. A page at a time, grouped
 * by day, narrowed to one person or one community with the two selects. The server keeps the log and refuses
 * the page to anyone but the owner, so a member never reaches it (AdminApp sends them to Today first).
 */
export default function Activity() {
  const { token } = useAdmin();
  const [communities, setCommunities] = useState([]);
  const [members, setMembers] = useState([]);
  const [adminId, setAdminId] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [entries, setEntries] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  // Which request's answer is still wanted: a filter changed while a page was on its way makes that page stale,
  // and it must not land on top of the one the new filters asked for.
  const wanted = useRef(0);

  useEffect(() => {
    // The side menu lists the communities, and both selects need them and the team by name.
    adminApi.communities(token).then(setCommunities).catch(() => {});
    adminApi.team(token).then(setMembers).catch(() => {});
  }, [token]);

  useEffect(() => {
    wanted.current += 1;
    const id = wanted.current;
    setEntries(null);
    setNextBefore(null);
    setError('');
    adminApi.activity(token, { adminId, communityId, limit: PAGE })
      .then((page) => {
        if (id !== wanted.current) return;
        setEntries(page.entries ?? []);
        setNextBefore(page.nextBefore ?? null);
      })
      .catch((err) => {
        if (id === wanted.current) setError(err.message);
      });
  }, [token, adminId, communityId]);

  const loadMore = async () => {
    const id = wanted.current;
    setLoadingMore(true);
    try {
      const page = await adminApi.activity(token, { adminId, communityId, before: nextBefore, limit: PAGE });
      if (id !== wanted.current) return;
      setEntries((list) => [...(list ?? []), ...(page.entries ?? [])]);
      setNextBefore(page.nextBefore ?? null);
    } catch (err) {
      if (id === wanted.current) setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = Boolean(adminId || communityId);

  return (
    <AdminShell
      communities={communities}
      title="Activity"
      blurb="What everyone on the team has changed, newest first."
    >
      <div className="as-filters">
        <div className="as-filter">
          <label className="as-bar__label" htmlFor="activity-who">Person</label>
          <select id="activity-who" className="input" value={adminId} onChange={(event) => setAdminId(event.target.value)}>
            <option value="">Everyone</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}
          </select>
        </div>
        <div className="as-filter">
          <label className="as-bar__label" htmlFor="activity-where">Community</label>
          <select id="activity-where" className="input" value={communityId} onChange={(event) => setCommunityId(event.target.value)}>
            <option value="">All communities</option>
            {communities.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}
          </select>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {entries === null && !error ? <Spinner /> : null}

      {entries && entries.length === 0 ? (
        <div className="as-empty">
          <strong>{filtered ? 'Nothing matches.' : 'Nothing here yet.'}</strong>
          <span>
            {filtered
              ? 'Nobody has changed anything that fits these filters.'
              : 'When someone on the team adds or changes something, it shows up here.'}
          </span>
        </div>
      ) : null}

      {entries ? groupByDay(entries).map((group) => (
        <section key={group.key} className="as-day" aria-labelledby={`day-${group.key}`}>
          <h2 className="as-day__title" id={`day-${group.key}`}>{group.label}</h2>
          <div className="as-day__box">
            <ActivityRows entries={group.entries} />
          </div>
        </section>
      )) : null}

      {entries && nextBefore ? (
        <div className="as-more">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </AdminShell>
  );
}
