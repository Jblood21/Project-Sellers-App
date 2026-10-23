import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { COMMUNITY_STATUSES, isArchived, isTourPending, isUnread } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import Wordmark from '../Wordmark.jsx';
import ChangePasswordDialog from '../screens/ChangePasswordDialog.jsx';
import { buyerUrl } from '../screens/QrDialog.jsx';
import { Dialog, ErrorNote, Spinner } from '../ui.jsx';
import NavIcon from './navIcons.jsx';
import { BOTTOM_KEYS, GROUPS, SECTIONS, sectionOf } from './sections.js';

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
 * Without a `community` it frames the Today page and the Team page, whose side menu lists the communities
 * instead of the sections. `leaveOk` is asked before anything that leaves the page: Setup uses it to stop
 * a tap from throwing away unsaved edits.
 */
export default function AdminShell({
  community = null, leads = null, section = '', communities = null, leaveOk = () => true,
  onEdit, onQr, title = '', blurb = '', children,
}) {
  const { admin, signOut } = useAdmin();
  const [moreOpen, setMoreOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const current = sectionOf(section);
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

        <nav aria-label={community ? 'Community sections' : 'Communities'} className="as-side__nav">
          <NavLink to="/admin" end className="as-link" onClick={guard()}>
            <NavIcon name="today" />
            <span className="as-link__label">Today</span>
            <span className="as-link__hint">all communities</span>
          </NavLink>

          {community ? (
            <>
              <button type="button" className="as-switch" onClick={() => setSwitchOpen(true)} aria-haspopup="dialog">
                <span className="as-switch__text">
                  <span className="as-eyebrow">Community</span>
                  <strong>{community.name}</strong>
                  <span className="as-switch__loc">{community.location || 'Location TBD'}</span>
                </span>
                <NavIcon name="switch" size={18} />
              </button>
              {GROUPS.map((group) => (
                <div key={group} className="as-group">
                  <span className="as-eyebrow">{group}</span>
                  {SECTIONS.filter((item) => item.group === group).map((item) => sectionLink(item))}
                </div>
              ))}
            </>
          ) : (
            <div className="as-group">
              <span className="as-eyebrow">Communities</span>
              {(communities ?? []).map((item) => (
                <NavLink key={item.id} to={`/admin/communities/${item.id}`} className="as-link" onClick={guard()}>
                  <NavIcon name="homes" />
                  <span className="as-link__label">{item.name}</span>
                  <Badge count={item.waiting} />
                </NavLink>
              ))}
              <Link to="/admin?new=1" className="as-link as-link--add" onClick={guard()}>
                <NavIcon name="plus" />
                <span className="as-link__label">New community</span>
              </Link>
            </div>
          )}
        </nav>

        <div className="as-side__foot">
          <span className="as-side__who" title={admin?.email}>{admin?.email}</span>
          <NavLink to="/admin/team" className="as-link as-link--quiet" onClick={guard()}>
            <NavIcon name="team" />
            <span className="as-link__label">Team</span>
          </NavLink>
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
            <Link to="/admin" className="as-top__icon" aria-label="Today, all communities" onClick={guard()}>
              <NavIcon name="today" />
            </Link>
            <button type="button" className="as-top__name" onClick={() => setSwitchOpen(true)} aria-haspopup="dialog">
              <strong>{community.name}</strong>
              <span>{community.location || 'Location TBD'} · switch</span>
            </button>
            <button type="button" className="as-top__icon" aria-label="Edit community" onClick={onEdit}>
              <NavIcon name="edit" />
            </button>
            <button type="button" className="as-top__icon" aria-label="QR code and flyer" onClick={onQr}>
              <NavIcon name="qr" />
            </button>
          </header>
        ) : (
          <header className="as-top">
            <span className="as-top__brand"><Wordmark size={20} /></span>
            <Link to="/admin/team" className="as-top__icon" aria-label="Team" onClick={guard()}>
              <NavIcon name="team" />
            </Link>
            <button type="button" className="as-top__icon" aria-label="Change password" onClick={() => setPasswordOpen(true)} aria-haspopup="dialog">
              <NavIcon name="key" />
            </button>
            <button type="button" className="as-top__text" onClick={leave}>Sign out</button>
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
                    {COMMUNITY_STATUSES.includes(community.status) ? <span className="tag tag-accent-2">{community.status}</span> : null}
                  </>
                ) : (blurb)}
              </p>
              {community && (blurb || current?.blurb) ? <p className="as-blurb">{blurb || current.blurb}</p> : null}
            </div>
            {community ? (
              <div className="as-head__actions">
                <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
                  <NavIcon name="open" size={16} /> Open buyer app
                </a>
                <button type="button" className="btn btn-secondary" onClick={onQr}>
                  <NavIcon name="qr" size={16} /> QR code &amp; flyer
                </button>
                <button type="button" className="btn btn-secondary" onClick={onEdit}>
                  <NavIcon name="edit" size={16} /> Edit community
                </button>
              </div>
            ) : null}
          </div>
          {children}
        </main>

        {community ? (
          <nav className="as-bottom" aria-label="Sections">
            {BOTTOM_KEYS.map((key) => sectionLink(sectionOf(key), { className: 'as-tab' }))}
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
            {SECTIONS.filter((item) => !BOTTOM_KEYS.includes(item.key)).map((item, index) => sectionLink(item, {
              className: 'as-sheet__row', onNavigate: () => setMoreOpen(false), first: index === 0,
            }))}
            <hr className="as-sheet__rule" />
            <a className="as-sheet__row" href={url} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)}>
              <NavIcon name="open" /><span className="as-link__label">Open buyer app</span>
            </a>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); onQr?.(); }}>
              <NavIcon name="qr" /><span className="as-link__label">QR code &amp; flyer</span>
            </button>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); onEdit?.(); }}>
              <NavIcon name="edit" /><span className="as-link__label">Edit community</span>
            </button>
            <button type="button" className="as-sheet__row" onClick={() => { setMoreOpen(false); setSwitchOpen(true); }}>
              <NavIcon name="switch" /><span className="as-link__label">Switch community</span>
            </button>
            <Link to="/admin" className="as-sheet__row" onClick={guard(() => setMoreOpen(false))}>
              <NavIcon name="today" /><span className="as-link__label">Today, all communities</span>
            </Link>
            <Link to="/admin/team" className="as-sheet__row" onClick={guard(() => setMoreOpen(false))}>
              <NavIcon name="team" /><span className="as-link__label">Team</span>
            </Link>
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

/** Pick another community. It opens on its Leads, the page the team lands on first. */
function SwitchDialog({ current, leaveOk, onClose }) {
  const { token } = useAdmin();
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

  return (
    <Dialog
      title="Switch community"
      onClose={onClose}
      actions={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      <ErrorNote>{error}</ErrorNote>
      {list === null && !error ? <Spinner /> : null}
      <div className="as-sheet" ref={sheet}>
        {(list ?? []).map((item) => (
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
        ))}
        <hr className="as-sheet__rule" />
        <Link to="/admin?new=1" className="as-sheet__row" onClick={guard}>
          <NavIcon name="plus" /><span className="as-link__label">New community</span>
        </Link>
        <Link to="/admin" className="as-sheet__row" onClick={guard}>
          <NavIcon name="today" /><span className="as-link__label">Today, all communities</span>
        </Link>
      </div>
    </Dialog>
  );
}
