import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { telHref } from '@shared/compliance.js';
import { money } from '@shared/domain.js';
import { themeView } from '@shared/customTheme.js';
import { photoImgProps } from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { emailHref } from '../../lib/contact.js';
import { useAdmin } from '../AdminContext.jsx';
import { groupByBranch, headedGroups } from '../branches.js';
import { isListing, localToday, nextOpenHouse, placeNoun, sessionLabel } from '../listing.js';
import AdminShell from '../shell/AdminShell.jsx';
import NavIcon from '../shell/navIcons.jsx';
import { LoadError, Spinner } from '../ui.jsx';
import ActivityRows from './ActivityRows.jsx';
import NewCommunityDialog from './NewCommunityDialog.jsx';
import NewListingDialog from './NewListingDialog.jsx';
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
  const listing = isListing(community);
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
          alt={listing ? `Photo of ${community.name}` : `${community.name} community photo`}
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
      <Link className="as-cover__add" to={listing ? `/admin/communities/${community.id}/homes` : `/admin/communities/${community.id}/setup/look#artwork`}>
        <NavIcon name={url || listing ? 'edit' : 'plus'} size={14} />
        {listing ? 'Photos of the home' : url ? 'Check the photo in Setup' : 'Add a photo in Setup'}
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
 * One listing's card: the address (the link to its Visitors), picture, city and price, where it stands, the next
 * open house (or a nudge to schedule one) and what needs a person. A listing is a single home, so there is no home
 * count, theme name or branch here.
 */
function ListingCard({ listing, today }) {
  const next = nextOpenHouse(listing, today);
  const base = `/admin/communities/${listing.id}`;
  return (
    <article className="card elev-sm as-community as-listing">
      <div className="as-community__head">
        <Link className="card-title as-community__name" to={`${base}/leads`} style={{ color: 'inherit', textDecoration: 'none' }}>
          {listing.name}
        </Link>
        <span className="tag tag-accent-2">{listing.status}</span>
      </div>
      <CommunityCover community={listing} />
      <div className="as-listing__where">
        <span className="text-muted" style={{ fontSize: 14 }}>{listing.location || 'City not added'}</span>
        {listing.price ? <strong className="as-listing__price">{money(listing.price)}</strong> : null}
      </div>
      {next ? (
        <span className="as-listing__open">Open house {sessionLabel(next)}</span>
      ) : (
        <Link className="as-listing__open as-listing__open--none" to={`${base}/setup/listing#open-houses`}>
          No open house scheduled
          <span className="as-sr"> for {listing.name}. Add one</span>
        </Link>
      )}
      <div className="as-community__stats">
        {listing.waiting ? <span className={`as-chip ${listing.overdue ? 'as-chip--late' : 'as-chip--call'}`}>{plural(listing.waiting, 'visitor')} waiting for a call{listing.overdue ? ` · ${listing.overdue} late` : ''}</span> : null}
        {listing.unread ? <span className="as-chip as-chip--soft">{listing.unread} new</span> : null}
        {!listing.waiting && !listing.unread ? <span className="as-chip">All caught up</span> : null}
      </div>
      <div className="card-meta">{plural(listing.people, 'visitor')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <Link className="btn btn-primary" to={`${base}/leads`}>Visitors</Link>
        <Link className="btn btn-ghost" to={`${base}/homes`}>The home</Link>
        <Link className="btn btn-link" to={`${base}/setup`}>Setup</Link>
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
  // The address opens the New listing pop-up (the menu and the buttons link to it), for owners and agents alike.
  const creatingListing = params.get('new') === 'listing';

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
  // Listings (single homes an agent is selling) are presented apart from communities. Branch grouping is for
  // communities only. The listing with the soonest open house comes first, those with none last.
  const today = localToday();
  const listings = data
    ? data.communities.filter(isListing)
      .map((listing, index) => ({ listing, index, next: nextOpenHouse(listing, today) }))
      .sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1)
        || (a.next && b.next ? (a.next.date + a.next.start).localeCompare(b.next.date + b.next.start) : 0)
        || a.index - b.index)
      .map((item) => item.listing)
    : [];
  const places = data ? data.communities.filter((community) => !isListing(community)) : [];
  const groups = data ? groupByBranch(places, data.branches) : [];
  const headed = headedGroups(groups, isOwner);
  // A fresh account, or an agent with nothing yet, starts on the listings; an owner with communities and no listings
  // keeps the page they had, with the New listing button beside New community.
  const showListings = listings.length > 0 || (!isOwner && places.length === 0);
  const showCommunities = places.length > 0 || (isOwner && listings.length === 0);
  const noun = placeNoun(listings.length > 0, places.length > 0);
  // Nothing of the account is a community: the page speaks of listings alone (an agent with nothing yet included).
  const onlyListings = !showCommunities;

  return (
    <AdminShell
      communities={data?.communities ?? []}
      branches={data?.branches ?? []}
      title="Today"
      blurb={`What needs a person right now, across every ${data ? (onlyListings ? 'listing' : listings.length ? 'listing and community' : 'community') : 'community'}.`}
    >
      {!data ? <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} retrying={retrying} /> : null}
      {!data && !error ? <Spinner /> : null}

      {data ? (
        <>
          <div className="as-tiles">
            {/* A listing has no booking times, so an account of listings alone has no booked calls to count. */}
            {onlyListings ? null : (
              <>
                <div className={`as-tile${totals.waiting ? ' as-tile--alert' : ''}`}>
                  <strong>{totals.waiting}</strong>
                  <span>{totals.waiting === 1 ? 'call waiting' : 'calls waiting'}</span>
                </div>
                <div className={`as-tile${totals.overdue ? ' as-tile--warn' : ''}`}>
                  <strong>{totals.overdue}</strong>
                  <span>past their day</span>
                </div>
              </>
            )}
            <div className={`as-tile${onlyListings && totals.ready ? ' as-tile--alert' : ''}`}>
              <strong>{totals.ready}</strong>
              <span>{onlyListings ? 'visitors to follow up (said yes to calls and texts)' : 'agreed to calls, no call booked'}</span>
            </div>
            <div className="as-tile">
              <strong>{totals.unread}</strong>
              <span>{onlyListings ? 'new visitors, not opened yet' : 'new, not opened yet'}</span>
            </div>
            <div className="as-tile">
              <strong>{totals.people}</strong>
              <span>
                {onlyListings
                  ? `visitors across ${plural(listings.length, 'listing')}`
                  : listings.length
                    ? `people across ${plural(listings.length, 'listing')} and ${plural(places.length, 'community', 'communities')}`
                    : `people in ${plural(totals.communities, 'community', 'communities')}`}
              </span>
            </div>
          </div>

          {showListings ? (
            <section aria-labelledby="today-listings">
              <div className="as-sectionhead">
                <h2 className="as-section-title" id="today-listings" style={{ margin: 0 }}>Your listings</h2>
                <span className="as-sectionhead__actions">
                  <Link className="btn btn-primary" to="/admin?new=listing"><NavIcon name="plus" size={16} /> New listing</Link>
                  {/* An owner with only listings still has a way to make a community; it is a quiet link, not a section. */}
                  {isOwner && !showCommunities ? <Link className="btn btn-link" to="/admin?new=1">New community</Link> : null}
                </span>
              </div>
              {listings.length === 0 ? (
                <div className="as-empty">
                  <strong>No listings yet.</strong>
                  <span>Add the first home you are selling to get its QR code, open house sign and visitor list.</span>
                </div>
              ) : (
                <div className="as-cards">
                  {listings.map((listing) => <ListingCard key={listing.id} listing={listing} today={today} />)}
                </div>
              )}
            </section>
          ) : null}

          {showCommunities ? (
            <section aria-labelledby="today-communities" style={showListings ? { marginTop: 28 } : undefined}>
              <div className="as-sectionhead">
                <h2 className="as-section-title" id="today-communities" style={{ margin: 0 }}>Your communities</h2>
                {isOwner ? (
                  <span className="as-sectionhead__actions">
                    <Link className="btn btn-primary" to="/admin?new=1"><NavIcon name="plus" size={16} /> New community</Link>
                    {!showListings ? <Link className="btn btn-secondary" to="/admin?new=listing"><NavIcon name="plus" size={16} /> New listing</Link> : null}
                  </span>
                ) : null}
              </div>
              {places.length === 0 ? (
                <div className="as-empty">
                  <strong>No communities yet.</strong>
                  <span>Create your first one to get its QR code, buyer app and lead list.</span>
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
            </section>
          ) : null}

          {isOwner && activity?.length ? (
            <section className="card elev-sm as-activity" aria-labelledby="team-activity">
              <div className="as-activity__head">
                <h2 className="card-title" id="team-activity">Team activity</h2>
                <Link className="btn btn-link" to="/admin/activity">All activity</Link>
              </div>
              <ActivityRows entries={activity} compact />
            </section>
          ) : null}

          {onlyListings ? null : (
            <>
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
              Showing the first {data.calls.length} of {totals.waiting}. Open a {noun} to see the rest.
            </p>
          ) : null}

            </>
          )}

          <h2 className="as-section-title" id="ready" style={onlyListings ? { marginTop: 28 } : undefined}>{onlyListings ? 'Visitors to follow up' : 'Agreed to calls, no call booked'}</h2>
          <p className="text-muted" style={{ fontSize: 14, margin: '-4px 0 10px' }}>
            {onlyListings ? 'They signed in, gave a number and said yes to calls and texts. ' : 'They said yes to calls and texts and gave a number, but have not asked for a time. '}Open one to see them in{' '}
            {onlyListings ? 'the listing\u2019s Visitors' : listings.length ? 'the Visitors or Leads page of its listing or community' : 'their community\u2019s Leads'}.
          </p>
          <ReadyToCall people={data.ready} total={totals.ready} totalNew={totals.readyNew} communities={data.communities} />
        </>
      ) : null}

      {creating ? <NewCommunityDialog onClose={closeNew} /> : null}
      {creatingListing ? <NewListingDialog onClose={closeNew} /> : null}
    </AdminShell>
  );
}
