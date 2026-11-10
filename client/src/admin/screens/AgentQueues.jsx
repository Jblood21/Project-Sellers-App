import { Link } from 'react-router-dom';

import { telHref } from '@shared/compliance.js';
import { describeShowing, formatSlotDate, interestLabel } from '@shared/domain.js';
import { textHref } from '../../lib/contact.js';
import NavIcon from '../shell/navIcons.jsx';

/**
 * The two lists an agent works from each morning: showings people asked for that nobody has answered, and the people
 * they set a day to follow up with that has come (oldest first). Each opens the person where they can answer or reschedule.
 */
function Row({ person, line, chip, to }) {
  const tel = person.canCall ? telHref(person.phone) : '';
  const sms = person.canCall ? textHref(person.phone) : '';
  return (
    <li className="as-ready__row">
      <Link className="as-ready__main" to={to}>
        <span className="as-ready__top">
          <span className="as-ready__name">{person.name}</span>
          {chip}
        </span>
        <span className="as-ready__line">{line} · {person.communityName}</span>
      </Link>
      <span className="as-ready__actions">
        {tel ? <a className="btn btn-primary" href={tel} aria-label={`Call ${person.name}`}><NavIcon name="phone" size={15} /> Call</a> : null}
        {sms ? <a className="btn btn-ghost" href={sms} aria-label={`Text ${person.name}`}><NavIcon name="chat" size={15} /> Text</a> : null}
      </span>
    </li>
  );
}

export default function AgentQueues({ showings = [], followUps = [] }) {
  if (!showings.length && !followUps.length) return null;
  return (
    <>
      {showings.length ? (
        <>
          <h2 className="as-section-title" id="showings">Showing requests to answer</h2>
          <div className="as-ready" role="region" aria-label="Showing requests nobody has answered" tabIndex={-1} style={{ marginBottom: 24 }}>
            <ul className="as-ready__list">
              {showings.map((person) => (
                <Row
                  key={person.leadId} person={person} line={describeShowing(person)}
                  to={`/admin/communities/${person.communityId}/leads/${person.leadId}`}
                />
              ))}
            </ul>
          </div>
        </>
      ) : null}
      {followUps.length ? (
        <>
          <h2 className="as-section-title" id="follow-ups">Follow up</h2>
          <div className="as-ready" role="region" aria-label="People to follow up with" tabIndex={-1} style={{ marginBottom: 24 }}>
            <ul className="as-ready__list">
              {followUps.map((person) => (
                <Row
                  key={person.leadId} person={person}
                  line={person.overdue ? `Was due ${formatSlotDate(person.followUpOn)}` : 'Due today'}
                  chip={person.interest ? <span className="as-chip">{interestLabel(person.interest)}</span> : null}
                  to={`/admin/communities/${person.communityId}/leads/${person.leadId}`}
                />
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}
