import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { telHref } from '@shared/compliance.js';
import { textHref } from '../../lib/contact.js';
import { shortDate } from '../../lib/format.js';
import NavIcon from '../shell/navIcons.jsx';
import { PillRow } from '../ui.jsx';

/**
 * Everyone, across every community, who agreed to calls and texts and gave a number but never asked for a time:
 * people the team may ring. Each opens in their own community's Leads, with that list showing the same people.
 *
 * The list scrolls in its own box, so a long one does not push the communities off the page, and it can be narrowed
 * by name, number or community, and to those nobody has marked contacted yet (where it starts).
 */
export default function ReadyToCall({ people, total, totalNew, communities }) {
  const [view, setView] = useState('new');
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState('');
  // Only the communities somebody in the current view belongs to, so picking one never shows an empty list.
  const inView = people.filter((person) => view === 'all' || !person.contacted);
  const places = communities.filter((community) => inView.some((person) => person.communityId === community.id));
  // A community chosen before the view changed, with nobody left in it, is no longer a choice.
  const place = places.some((community) => community.id === where) ? where : '';

  const rows = useMemo(() => {
    const words = query.trim().toLowerCase();
    const digits = words.replace(/\D/g, '');
    // A number is matched as it was typed and as the Call button dials it, so "+1 801 555 3246" finds "(801) 555-3246".
    const numbers = (phone) => `${phone.replace(/\D/g, '')} ${telHref(phone).replace(/\D/g, '')}`;
    return people.filter((person) => (view === 'all' || !person.contacted)
      && (!place || person.communityId === place)
      && (!words
        || person.name.toLowerCase().includes(words)
        || person.communityName.toLowerCase().includes(words)
        || (digits.length >= 3 && numbers(person.phone).includes(digits))));
  }, [people, place, query, view]);

  if (!total) {
    return (
      <div className="as-empty">
        <strong>No one to list yet.</strong>
        <span>People who agree to calls and texts but do not pick a time show up here.</span>
      </div>
    );
  }

  return (
    <div className="as-ready-wrap">
      <div className="as-bar">
        <div className="as-bar__row">
          <span className="as-bar__label" aria-hidden="true">Show</span>
          <PillRow
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'new', label: `Not contacted yet ${totalNew}` },
              { value: 'all', label: `Everyone ${total}` },
            ]}
          />
        </div>
        <div className="as-bar__row">
          <input
            className="input"
            type="search"
            aria-label="Search by name, number or community"
            placeholder="Search name or number"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {places.length > 1 ? (
            <select className="input" aria-label="Community" value={place} onChange={(event) => setWhere(event.target.value)}>
              <option value="">Every community</option>
              {places.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}
            </select>
          ) : null}
        </div>
      </div>

      <div className="as-ready" role="region" aria-label="People who agreed to calls but have not booked one" tabIndex={-1}>
        {rows.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14, margin: 0, padding: 16 }}>
            {view === 'new' && !query && !place ? 'Everyone here has been contacted. Choose Everyone to see them.' : 'No one matches.'}
          </p>
        ) : (
          <ul className="as-ready__list">
            {rows.map((person) => {
              const tel = telHref(person.phone);
              const sms = textHref(person.phone);
              return (
                <li key={person.leadId} className="as-ready__row">
                  {/* Opens the person in their community's Leads, where the list shows the others like them. */}
                  <Link className="as-ready__main" to={`/admin/communities/${person.communityId}/leads/${person.leadId}?show=ready`}>
                    <span className="as-ready__top">
                      <span className="as-ready__name">{person.name}</span>
                      {person.contacted ? <span className="as-chip">Contacted</span> : null}
                    </span>
                    <span className="as-ready__line">
                      <span className="as-ready__phone">{person.phone}</span> · {person.communityName}
                    </span>
                    <span className="as-ready__meta">{person.agreedAt ? `Agreed to calls ${shortDate(person.agreedAt)}` : 'Agreed to calls'}</span>
                  </Link>
                  <span className="as-ready__actions">
                    {tel ? <a className="btn btn-primary" href={tel} aria-label={`Call ${person.name}`}><NavIcon name="phone" size={15} /> Call</a> : null}
                    {sms ? <a className="btn btn-ghost" href={sms} aria-label={`Text ${person.name}`}><NavIcon name="chat" size={15} /> Text</a> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-muted" role="status" style={{ fontSize: 14, margin: '8px 0 0' }}>
        {rows.length === 1 ? '1 person' : `${rows.length} people`} shown
        {people.length < total ? `, from the ${people.length} listed here of ${total}. Each community's Leads, under Agreed, has everyone.` : '.'}
      </p>
    </div>
  );
}
