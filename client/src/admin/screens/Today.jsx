import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { telHref } from '@shared/compliance.js';
import { themeView } from '@shared/customTheme.js';
import { photoImgProps } from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { emailHref } from '../../lib/contact.js';
import { useAdmin } from '../AdminContext.jsx';
import { groupByBranch, headedGroups } from '../branches.js';
import AdminShell from '../shell/AdminShell.jsx';
import NavIcon from '../shell/navIcons.jsx';
import { LoadError, Spinner } from '../ui.jsx';
import ActivityRows from './ActivityRows.jsx';
import NewCommunityDialog from './NewCommunityDialog.jsx';
import ReadyToCall from './ReadyToCall.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The theme a community's buyers see, named the way Setup names it (themeView): "Navy & Gold theme", or
 * "Custom colours" for a community's own.
 */
function themeLabel(community) {
  const view = themeView(community.theme, community.settings);
  return view.custom ? view.name : `${view.name} theme`;
}

// Words too small to stand for a community: "The Reserve at Willow Creek" is RW, not TR.
const MINOR_WORDS = new Set(['the', 'a', 'an', 'at', 'of', 'on', 'in', 'by', 'and', '&']);

/** Up to two letters for a community with no picture yet, from the first letter or digit of its first two main words. */
function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const main = words.filter((word) => !MINOR_WORDS.has(word.toLowerCase()));
  return (main.length ? main : words)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase();
}

/**
 * The picture across the top of a community's card: its hero photo, the one buyers see on the QR landing, so the
 * cards differ at a glance and not only by name. The box keeps one height whether or not there is a picture, so
 * the cards line up and nothing moves while a photo loads; the community's own theme colours fill it until then.
 *
 * With no photo (or one that fails to load) the box stays in those colours with the community's initials, so two
 * cards still look different, and links straight to the hero photo's slot in Setup (#artwork), not to the top of
 * Setup where the card's own Setup button goes. The name is the card's link to Leads; it reaches over this box
 * (admin-shell.css), so the picture opens Leads too without a second stop for the keyboard.
 *
 * The card puts this box after the name and shows it on top with CSS, so the keyboard and a screen reader meet the
 * community's name first and the photo link only after it.
 */
function CommunityCover({ community }) {
  const url = community.heroPhoto;
  const [failed, setFailed] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const { colors } = themeView(community.theme, community.settings);
  const style = { '--cover-ground': colors.primary, '--cover-mark': colors.accent };

  if (url && failed !== url) {
    return (
      <div className="as-cover" style={style}>
        <img
          className={`as-cover__img${loaded === url ? ' is-loaded' : ''}`}
          // About 290 to 360 px wide in the grid, nearer 570 in one column on a small tablet.
          {...photoImgProps(url, '(min-width: 640px) 400px, 100vw')}
          alt={`${community.name} community photo`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(url)}
          onError={() => setFailed(url)}
        />
      </div>
    );
  }

  const initials = initialsOf(community.name);
  return (
    <div className="as-cover as-cover--empty" style={style}>
      <span className="as-cover__mark" aria-hidden="true">{initials || <NavIcon name="homes" size={26} />}</span>
      <Link className="as-cover__add" to={`/admin/communities/${community.id}/setup/look#artwork`}>
        <NavIcon name={url ? 'edit' : 'plus'} size={14} />
        {url ? 'Check the photo in Setup' : 'Add a photo in Setup'}
        <span className="as-sr"> for {community.name}</span>
      </Link>
    </div>
  );
}

/** One community's card: its name (the link to Leads), picture, place, what needs a person, and the ways in. */
function CommunityCard({ community }) {
  return (
    <article className="card elev-sm as-community">
      <div className="as-community__head">
        <Link className="card-title as-community__name" to={`/admin/communities/${community.id}/leads`} style={{ color: 'inherit', textDecoration: 'none' }}>
          {community.name}
        </Link>
        <span className="tag tag-accent-2">{community.status}</span>
      </div>
      <CommunityCover community={community} />
      <span className="text-muted" style={{ fontSize: 14 }}>{community.location || 'Location TBD'}</span>
      <div className="as-community__stats">
        {community.waiting ? <span className={`as-chip ${community.overdue ? 'as-chip--late' : 'as-chip--call'}`}>{plural(community.waiting, 'call')} waiting{community.overdue ? ` · ${community.overdue} late` : ''}</span> : null}
        {community.unread ? <span className="as-chip as-chip--soft">{community.unread} new</span> : null}
        {!community.waiting && !community.unread ? <span className="as-chip">All caught up</span> : null}
      </div>
      <div className="card-meta">
        {plural(community.homesCount, 'home')} · {plural(community.people, 'person', 'people')} · {themeLabel(community)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <Link className="btn btn-primary" to={`/admin/communities/${community.id}/leads`}>Leads</Link>
        <Link className="btn btn-ghost" to={`/admin/communities/${community.id}/homes`}>Homes</Link>
        <Link className="btn btn-link" to={`/admin/communities/${community.id}/setup`}>Setup</Link>
      </div>
    </article>
  );
}

/**
 * Where the admin opens: the counts that need a person today, the communities, and under them the calls waiting and
 * the people who agreed to calls without booking one, across every community this person has. The server answers
 * with the owner's every community, or the ones a member was given, so the page shows what it is sent; what is the
 * owner's alone (New community, and the card of what the team has been doing) is kept from a member here.
 *
 * The cards sit under their branches' names (the companies or groups the owner sorts communities into), in name
 * order with "No branch" last, so one company's communities read as one block; the heading is left out when
 * there is only one block, and for a member unless they are in two or more branches (headedGroups).
 */
export default function Today() {
  const { token, isOwner } = useAdmin();
  const [data, setData] = useState(null);
  // The error the page's load ended in, kept whole so a bad signal gets a Retry and a refusal does not.
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  // The last few things the team changed, for the owner's card; null until they have arrived.
  const [activity, setActivity] = useState(null);
  const creating = params.get('new') === '1' && isOwner;

  useEffect(() => {
    let cancelled = false;
    setRetrying(true);
    adminApi
      .today(token)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setRetrying(false));
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  // Asked for only as the owner (the server refuses it to anyone else), and the card stays away when it fails or
  // there is nothing yet: Today is about what needs a person, not about an empty log.
  useEffect(() => {
    if (!isOwner) return undefined;
    let cancelled = false;
    adminApi.activity(token, { limit: 5 }).then((page) => !cancelled && setActivity(page.entries ?? [])).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, isOwner]);

  const closeNew = () => setParams({}, { replace: true });
  const totals = data?.totals;
  const groups = data ? groupByBranch(data.communities, data.branches) : [];
  const headed = headedGroups(groups, isOwner);

  return (
    <AdminShell
      communities={data?.communities ?? []}
      branches={data?.branches ?? []}
      title="Today"
      blurb="What needs a person right now, across every community."
    >
      {!data ? <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} retrying={retrying} /> : null}
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
              <strong>{totals.ready}</strong>
              <span>agreed to calls, no call booked</span>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 10px' }}>
            <h2 className="as-section-title" style={{ margin: 0 }}>Your communities</h2>
            {isOwner ? <Link className="btn btn-primary" to="/admin?new=1"><NavIcon name="plus" size={16} /> New community</Link> : null}
          </div>
          {data.communities.length === 0 ? (
            <div className="as-empty">
              {isOwner ? (
                <>
                  <strong>No communities yet.</strong>
                  <span>Create your first one to get its QR code, buyer app and lead list.</span>
                </>
              ) : (
                <>
                  <strong>No communities have been shared with you yet.</strong>
                  <span>When the owner gives you one, it shows up here.</span>
                </>
              )}
            </div>
          ) : groups.map((group) => (
            <section
              key={group.id ?? ''} className="as-branchgroup"
              aria-labelledby={headed ? `today-branch-${group.id ?? 'none'}` : undefined}
            >
              {headed ? <h3 className="as-branchgroup__title" id={`today-branch-${group.id ?? 'none'}`}>{group.name}</h3> : null}
              <div className="as-cards">
                {group.communities.map((community) => <CommunityCard key={community.id} community={community} />)}
              </div>
            </section>
          ))}

          {isOwner && activity?.length ? (
            <section className="card elev-sm as-activity" aria-labelledby="team-activity">
              <div className="as-activity__head">
                <h2 className="card-title" id="team-activity">Team activity</h2>
                <Link className="btn btn-link" to="/admin/activity">All activity</Link>
              </div>
              <ActivityRows entries={activity} compact />
            </section>
          ) : null}

          <h2 className="as-section-title" style={{ marginTop: 28 }}>Calls waiting</h2>
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
                      {mail ? <a className="btn btn-ghost" href={mail}><NavIcon name="mail" size={16} /> Email</a> : null}
                      <Link className="btn btn-link" to={`/admin/communities/${call.communityId}/leads/${call.leadId}?show=tour`}>Open</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {totals.waiting > data.calls.length ? (
            <p className="text-muted" style={{ fontSize: 14 }}>
              Showing the first {data.calls.length} of {totals.waiting}. Open a community to see the rest.
            </p>
          ) : null}

          <h2 className="as-section-title" id="ready">Agreed to calls, no call booked</h2>
          <p className="text-muted" style={{ fontSize: 14, margin: '-4px 0 10px' }}>
            They said yes to calls and texts and gave a number, but have not asked for a time. Open one to see them in
            their community&apos;s Leads.
          </p>
          <ReadyToCall people={data.ready} total={totals.ready} totalNew={totals.readyNew} communities={data.communities} />
        </>
      ) : null}

      {creating ? <NewCommunityDialog onClose={closeNew} /> : null}
    </AdminShell>
  );
}
