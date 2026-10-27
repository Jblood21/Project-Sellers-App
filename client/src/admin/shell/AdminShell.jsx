import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { COMMUNITY_STATUSES, LISTING_STATUSES, isArchived, isTourPending, isUnread } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { groupByBranch, headedGroups } from '../branches.js';
import { isListing } from '../listing.js';
import Wordmark from '../Wordmark.jsx';
import ChangePasswordDialog from '../screens/ChangePasswordDialog.jsx';
import { buyerUrl } from '../screens/QrDialog.jsx';
import { Dialog, ErrorNote, Spinner } from '../ui.jsx';
import NavIcon from './navIcons.jsx';
import { BOTTOM_KEYS, GROUPS, sectionOf, sectionsFor } from './sections.js';

import '../../styles/admin-shell.css';

/** People who are new to the team or waiting on a call: the number worth a badge. */
export const attentionCount = (leads) => (leads ?? [])
  .filter((lead) => !isArchived(lead) && (isUnread(lead) || isTourPending(lead))).length;

function Badge({ count }) {
  if (!count) return null;
  return (
    <>
      <span className="as-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="as-sr"> ({count} need attention)</span>
    </>
  );
}

/**
 * The frame around every admin page. A side menu on a computer, a top bar and a bottom bar on a phone
 * (both are in the page and the stylesheet shows one), so a section is one tap away on either.
 *
 * Without a `community` it frames the Today, Team, Branches and Activity pages, whose side menu lists the
 * communities instead of the sections, under their branches' names once there are groups to tell apart, by the
 * same rule as Today's cards (headedGroups; `branches` gives the names when the rows do not carry them).
 * `leaveOk` is asked before anything that leaves the page: Setup uses it to stop a tap from throwing away
 * unsaved edits.
 *
 * Team, Branches, Activity and New community are the owner's: a member's menus, bars and sheets leave them out,
 * and the communities listed are the ones the server let them have.
 */
export default function AdminShell({
  community = null, leads = null, section = '', communities = null, branches = null, leaveOk = () => true,
  onEdit, onQr, title = '', blurb = '', children,
}) {
  const { admin, isOwner, signOut } = useAdmin();
  const [moreOpen, setMoreOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // A listing (one home an agent is selling) has the same sections with its own words: Visitors, The home, Neighborhood.
  const listing = isListing(community);
  const sections = sectionsFor(listing);
  const current = sectionOf(section, listing);
  const attention = attentionCount(leads);
  const guard = (after) => (event) => {
    if (!leaveOk()) {
      event.preventDefault();
      return;
    }
    after?.();
  };
  const leave = () => {
    if (leaveOk()) signOut();
  };
  const base = community ? `/admin/communities/${community.id}` : '';
  const countFor = (key) => (key === 'leads' ? attention : 0);
  const url = community ? buyerUrl(community) : '';
  // The menu on Today-like pages lists listings apart from communities: under "Listings" and "Communities" when an
  // account has both, and under the one heading it has otherwise. Branches group communities only.
  const listings = (communities ?? []).filter(isListing);
  const places = (communities ?? []).filter((item) => !isListing(item));
  const groups = groupByBranch(places, branches ?? []);
  const headed = headedGroups(groups, isOwner);
  // An agent (a member) can make listings and nothing else, so with nothing yet they get the Listings heading and
  // its "New listing". The owner with only communities keeps the heading they always had.
  const showListings = listings.length > 0 || (!isOwner && places.length === 0);
  const showCommunities = places.length > 0 || (isOwner && listings.length === 0);
  const noun = listing ? 'listing' : 'community';

  const sectionLink = (item, { onNavigate, className = 'as-link', first = false } = {}) => (
    <NavLink
      key={item.key} to={`${base}/${item.key}`} className={className} onClick={guard(onNavigate)}
      data-autofocus={first ? '' : undefined}
    >
      <NavIcon name={item.key} />
      <span className="as-link__label">{item.label}</span>
      <Badge count={countFor(item.key)} />
    </NavLink>
  );

  return (
    <div className={`as-app${community ? ' has-bottom' : ''}`}>
      <aside className="as-side">
        <Link to="/admin" className="as-brand" onClick={guard()}>
          <Wordmark size={22} />
        </Link>

        <nav aria-label={community ? (listing ? 'Listing sections' : 'Community sections') : (showListings && !showCommunities ? 'Listings' : 'Communities')} className="as-side__nav">
          <NavLink to="/admin" end className="as-link" onClick={guard()}>
            <NavIcon name="today" />
            <span className="as-link__label">Today</span>
            <span className="as-link__hint">
              {community ? (listing ? 'all listings' : 'all communities') : showListings && !showCommunities ? 'all listings' : showListings ? 'everything' : 'all communities'}
            </span>
          </NavLink>

          {community ? (
            <>
              <button type="button" className="as-switch" onClick={() => setSwitchOpen(true)} aria-haspopup="dialog">
                <span className="as-switch__text">
                  <span className="as-eyebrow">{listing ? 'Listing' : 'Community'}</span>
                  <strong>{community.name}</strong>
                  <span className="as-switch__loc">{community.location || 'Location TBD'}</span>
                </span>
                <NavIcon name="switch" size={18} />
              </button>
              {GROUPS.map((group) => (
                <div key={group} className="as-group">
                  <span className="as-eyebrow">{group}</span>
                  {sections.filter((item) => item.group === group).map((item) => sectionLink(item))}
                </div>
              ))}
            </>
          ) : (
            <>
              {showListings ? (
                <div className="as-group">
                  <span className="as-eyebrow">Listings</span>
                  {listings.map((item) => (
                    <NavLink key={item.id} to={`/admin/communities/${item.id}`} className="as-link" onClick={guard()}>
                      <NavIcon name="homes" />
                      <span className="as-link__label">{item.name}</span>
                      <Badge count={item.waiting} />
                    </NavLink>
                  ))}
                  <Link to="/admin?new=listing" className="as-link as-link--add" onClick={guard()}>
                    <NavIcon name="plus" />
                    <span className="as-link__label">New listing</span>
                  </Link>
                </div>
              ) : null}
              {showCommunities ? (
                <div className="as-group">
                  <span className="as-eyebrow">Communities</span>
                  {groups.map((group) => (
                    <Fragment key={group.id ?? ''}>
                      {headed ? <span className="as-subhead">{group.name}</span> : null}
                      {group.communities.map((item) => (
                        <NavLink key={item.id} to={`/admin/communities/${item.id}`} className="as-link" onClick={guard()}>
                          <NavIcon name="homes" />
                          <span className="as-link__label">{item.name}</span>
                          <Badge count={item.waiting} />
                        </NavLink>
                      ))}
                    </Fragment>
                  ))}
                  {isOwner ? (
                    <Link to="/admin?new=1" className="as-link as-link--add" onClick={guard()}>
                      <NavIcon name="plus" />
                      <span className="as-link__label">New community</span>
                    </Link>
                  ) : null}
                  {!showListings ? (
                    <Link to="/admin?new=listing" className="as-link as-link--add" onClick={guard()}>
                      <NavIcon name="plus" />
                      <span className="as-link__label">New listing</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </nav>

        <div className="as-side__foot">
          <span className="as-side__who" title={admin?.email}>{admin?.email}</span>
          {isOwner ? (
            <>
              <NavLink to="/admin/team" className="as-link as-link--quiet" onClick={guard()}>
                <NavIcon name="team" />
                <span className="as-link__label">Team</span>
              </NavLink>
              <NavLink to="/admin/branches" className="as-link as-link--quiet" onClick={guard()}>
                <NavIcon name="branches" />
                <span className="as-link__label">Branches</span>
              </NavLink>
              <NavLink to="/admin/activity" className="as-link as-link--quiet" onClick={guard()}>
                <NavIcon name="activity" />
                <span className="as-link__label">Activity</span>
              </NavLink>
            </>
          ) : null}
          <button type="button" className="as-link as-link--quiet" onClick={() => setPasswordOpen(true)} aria-haspopup="dialog">
            <NavIcon name="key" />
            <span className="as-link__label">Change password</span>
          </button>
          <button type="button" className="as-link as-link--quiet" onClick={leave}>
            <NavIcon name="signout" />
            <span className="as-link__label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="as-main">
        {community ? (
          <header className="as-top">
            <Link to="/admin" className="as-top__icon" aria-label={listing ? 'Today, all listings' : 'Today, all communities'} onClick={guard()}>
              <NavIcon name="today" />
            </Link>
            <button type="button" className="as-top__name" onClick={() => setSwitchOpen(true)} aria-haspopup="dialog">
              <strong>{community.name}</strong>
              <span>{community.location || 'Location TBD'} · switch</span>
            </button>
            <button type="button" className="as-top__icon" aria-label={`Edit ${noun}`} onClick={onEdit}>
              <NavIcon name="edit" />
            </button>
            <button type="button" className="as-top__icon" aria-label={listing ? 'QR code and open house sign' : 'QR code and flyer'} onClick={onQr}>
              <NavIcon name="qr" />
            </button>
          </header>
        ) : (
          // The owner's bar is the full one: five round buttons after the wordmark, which on the narrowest phones
          // is more than fits beside the name, so the stylesheet keeps the mark alone there (as-top--full).
          <header className={`as-top${isOwner ? ' as-top--full' : ''}`}>
            <span className="as-top__brand"><Wordmark size={20} /></span>
            {isOwner ? (
              <>
                <Link to="/admin/team" className="as-top__icon" aria-label="Team" onClick={guard()}>
                  <NavIcon name="team" />
                </Link>
                <Link to="/admin/branches" className="as-top__icon" aria-label="Branches" onClick={guard()}>
                  <NavIcon name="branches" />
                </Link>
                <Link to="/admin/activity" className="as-top__icon" aria-label="Activity" onClick={guard()}>
                  <NavIcon name="activity" />
                </Link>
              </>
            ) : null}
            <button type="button" className="as-top__icon" aria-label="Change password" onClick={() => setPasswordOpen(true)} aria-haspopup="dialog">
              <NavIcon name="key" />
            </button>
            <button type="button" className="as-top__icon" aria-label="Sign out" onClick={leave}>
              <NavIcon name="signout" />
            </button>
          </header>
        )}

        <main className={`as-page as-page--${current?.width ?? 'normal'}`}>
          <div className="as-head">
            <div className="as-head__text">
              <h1 className="as-h1">{title || current?.label}</h1>
              <p className="as-sub">
                {community ? (
                  <>
                    {community.name}
                    {community.location ? ` · ${community.location}` : ''}
                    {(listing ? LISTING_STATUSES : COMMUNITY_STATUSES).includes(community.status) ? <span className="tag tag-accent-2">{community.status}</span> : null}
                  </>
                ) : (blurb)}
              </p>
              {community && (blurb || current?.blurb) ? <p className="as-blurb">{blurb || current.blurb}</p> : null}
            </div>
            {community ? (
              <div className="as-head__actions">
                <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
                  <NavIcon name="open" size={16} /> {listing ? 'See what visitors see' : 'Open buyer app'}
                </a>
                <button type="button" className="btn btn-secondary" onClick={onQr}>
                  <NavIcon name="qr" size={16} /> {listing ? 'QR code & open house sign' : 'QR code & flyer'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onEdit}>
                  <NavIcon name="edit" size={16} /> Edit {noun}
                </button>
              </div>
            ) : null}
          </div>
          {children}
        </main>

        {community ? (
          <nav className="as-bottom" aria-label="Sections">
            {BOTTOM_KEYS.map((key) => sectionLink(sectionOf(key, listing), { className: 'as-tab' }))}
            <button
              type="button"
              className={`as-tab${BOTTOM_KEYS.includes(section) ? '' : ' is-active'}`}
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
            >
              <NavIcon name="more" />
              <span className="as-link__label">More</span>
            </button>
          </nav>
        ) : null}
      </div>

      {moreOpen && community ? (
        <Dialog
          title="More"
          onClose={() => setMoreOpen(false)}
          actions={<button type="button" className="btn btn-secondary" onClick={() => setMoreOpen(false)}>Close</button>}
        >
          <div className="as-sheet">
            {sections.filter((item) => !BOTTOM_KEYS.includes(item.key)).map((item, index) => sectionLink(item, {
              className: 'as-sheet__row', onNavigate: () => setMoreOpen(false), first: index === 0,
            }))}
            <hr className="as-sheet__rule" />
            <a className="as-sheet__row" href={url} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)}>
              <NavIcon name="open" /><span className="as-link__label">{listing ? 'See what visitors see' : 'Open buyer app'}</span>
            </a>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); onQr?.(); }}>
              <NavIcon name="qr" /><span className="as-link__label">{listing ? 'QR code & open house sign' : 'QR code & flyer'}</span>
            </button>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); onEdit?.(); }}>
              <NavIcon name="edit" /><span className="as-link__label">Edit {noun}</span>
            </button>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); setSwitchOpen(true); }}>
              <NavIcon name="switch" /><span className="as-link__label">Switch {noun}</span>
            </button>
            <Link to="/admin" className="as-sheet__row" onClick={guard(() => setMoreOpen(false))}>
              <NavIcon name="today" /><span className="as-link__label">{listing ? 'Today, all listings' : 'Today, all communities'}</span>
            </Link>
            {isOwner ? (
              <>
                <Link to="/admin/team" className="as-sheet__row" onClick={guard(() => setMoreOpen(false))}>
                  <NavIcon name="team" /><span className="as-link__label">Team</span>
                </Link>
                <Link to="/admin/branches" className="as-sheet__row" onClick={guard(() => setMoreOpen(false))}>
                  <NavIcon name="branches" /><span className="as-link__label">Branches</span>
                </Link>
                <Link to="/admin/activity" className="as-sheet__row" onClick={guard(() => setMoreOpen(false))}>
                  <NavIcon name="activity" /><span className="as-link__label">Activity</span>
                </Link>
              </>
            ) : null}
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); setPasswordOpen(true); }}>
              <NavIcon name="key" /><span className="as-link__label">Change password</span>
            </button>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); leave(); }}>
              <NavIcon name="signout" /><span className="as-link__label">Sign out</span>
            </button>
          </div>
        </Dialog>
      ) : null}

      {passwordOpen ? <ChangePasswordDialog onClose={() => setPasswordOpen(false)} /> : null}

      {switchOpen && community ? (
        <SwitchDialog
          current={community}
          leaveOk={leaveOk}
          onClose={() => setSwitchOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Pick another community. It opens on its Leads, the page the team lands on first. The list is what the server
 * answers, so a member sees only their own; New community is the owner's.
 */
function SwitchDialog({ current, leaveOk, onClose }) {
  const { token, isOwner } = useAdmin();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const sheet = useRef(null);

  useEffect(() => {
    adminApi.communities(token).then(setList).catch((err) => setError(err.message));
  }, [token]);

  // The list arrives after the pop-up opens; put the keyboard on this community (or the first) once it is there.
  useEffect(() => {
    if (list) sheet.current?.querySelector('[aria-current="true"], a.as-sheet__row')?.focus();
  }, [list]);

  const guard = (event) => {
    if (!leaveOk()) {
      event.preventDefault();
      return;
    }
    onClose();
  };

  // A list of one kind is named for it; a mix is two short lists under their own words, listings first.
  const listings = (list ?? []).filter(isListing);
  const places = (list ?? []).filter((item) => !isListing(item));
  const mixed = listings.length > 0 && places.length > 0;
  const currentIsListing = isListing(current);
  const title = mixed ? 'Switch listing or community' : listings.length || (list === null && currentIsListing) ? 'Switch listing' : 'Switch community';
  const showNewListing = listings.length > 0 || !isOwner || currentIsListing;

  const row = (item) => (
    <Link
      key={item.id}
      to={`/admin/communities/${item.id}/leads`}
      className="as-sheet__row"
      aria-current={item.id === current.id ? 'true' : undefined}
      onClick={guard}
    >
      <NavIcon name="homes" />
      <span className="as-link__label">
        {item.name}
        <span className="as-hint">{item.location || 'Location TBD'}</span>
      </span>
      {item.pendingTours > 0 ? <span className="as-badge" title="Waiting for a call">{item.pendingTours}</span> : null}
    </Link>
  );

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      <ErrorNote>{error}</ErrorNote>
      {list === null && !error ? <Spinner /> : null}
      <div className="as-sheet" ref={sheet}>
        {mixed ? <span className="as-eyebrow as-sheet__eyebrow">Listings</span> : null}
        {listings.map(row)}
        {mixed ? <span className="as-eyebrow as-sheet__eyebrow">Communities</span> : null}
        {places.map(row)}
        <hr className="as-sheet__rule" />
        {showNewListing ? (
          <Link to="/admin?new=listing" className="as-sheet__row" onClick={guard}>
            <NavIcon name="plus" /><span className="as-link__label">New listing</span>
          </Link>
        ) : null}
        {isOwner && !(currentIsListing && !places.length) ? (
          <Link to="/admin?new=1" className="as-sheet__row" onClick={guard}>
            <NavIcon name="plus" /><span className="as-link__label">New community</span>
          </Link>
        ) : null}
        <Link to="/admin" className="as-sheet__row" onClick={guard}>
          <NavIcon name="today" /><span className="as-link__label">{mixed ? 'Today' : listings.length ? 'Today, all listings' : 'Today, all communities'}</span>
        </Link>
      </div>
    </Dialog>
  );
}
