import { useBuyer } from './BuyerContext.jsx';
import {
  dayLabel, directionsUrl, downloadIcs, isNowOpen, openHouseIcs, timeRange,
} from './openHouse.js';

/**
 * The open houses of a listing that are still to come: the day and time of each, the agent's note, a button
 * that saves the session to the buyer's calendar (an .ics file made here, in the browser; its times are the
 * home's own local times, with no zone, so 1 pm lands at 1 pm wherever the phone is) and a link to directions.
 * A session that is on right now by the viewer's clock says "Now open". Nothing is drawn with no sessions.
 *
 * `sessions`, `today` and `time` come from useOpenHouses (the viewer's own date and time of day).
 */
export default function OpenHouseCard({ sessions, today, time }) {
  const { community, communityId, track } = useBuyer();
  if (!sessions.length) return null;

  const address = community?.name ?? '';
  const place = community?.location ?? '';

  return (
    <section className="b-ls-oh" aria-labelledby="listing-open-houses">
      <h2 id="listing-open-houses" className="b-head b-ls-oh__title">
        {sessions.length > 1 ? 'Open houses' : 'Open house'}
      </h2>
      <ul className="b-ls-oh__list">
        {sessions.map((session) => {
          const now = isNowOpen(session, today, time);
          const isToday = session.date === today;
          return (
            <li key={`${session.date}-${session.start}`} className="b-ls-oh__item" data-now={now || undefined}>
              <div className="b-ls-oh__when">
                <span className="b-ls-oh__day">
                  {isToday ? `Today · ${dayLabel(session.date)}` : dayLabel(session.date)}
                </span>
                <span className="b-ls-oh__time">{timeRange(session.start, session.end)}</span>
                {now ? <span className="b-ls-oh__now">Now open</span> : null}
              </div>
              {session.note ? <p className="b-ls-oh__note">{session.note}</p> : null}
              <div className="b-ls-oh__actions">
                <button
                  type="button"
                  className="b-ls-oh__act"
                  onClick={() => {
                    track(`Added the ${dayLabel(session.date)} open house to their calendar`);
                    downloadIcs(
                      openHouseIcs(session, { address, place, uid: communityId }),
                      `open-house-${session.date}.ics`,
                    );
                  }}
                  aria-label={`Add the ${dayLabel(session.date)} open house to your calendar`}
                >
                  Add to calendar
                </button>
                <a
                  className="b-ls-oh__act"
                  href={directionsUrl(address, place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('Opened directions to the home')}
                  aria-label={`Directions to ${address} (opens a map)`}
                >
                  Directions
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
