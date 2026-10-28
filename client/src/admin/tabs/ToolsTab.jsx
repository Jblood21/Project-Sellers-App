import { useEffect, useRef, useState } from 'react';

import { FEATURES, TOOLS } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { isListing } from '../listing.js';
import { SaveNote, Toggle, useSaving } from '../ui.jsx';

/**
 * One switch and what it does. It moves the moment it is tapped and is held still ("Saving…") until the server has
 * answered, so a slow signal does not leave people unsure whether the tap took, or tapping again and flipping it
 * straight back. If the change does not save, the switch goes back to where the server has it and the row says so,
 * with Retry. A switch is the one place where moving first is safe: the page it sits on is the only thing that
 * reads the answer, and the old position is known.
 */
function SwitchRow({ item, group, community, reload }) {
  const { token } = useAdmin();
  const saver = useSaving();
  const stored = Boolean(group === 'tools' ? community.tools[item.k] : community.features?.[item.k]);
  // Where the person just put the switch, until the community the page holds has caught up with it.
  const [wanted, setWanted] = useState(null);
  const latest = useRef(0);
  const shown = wanted ?? stored;

  // The page's own copy now says what was asked for (a reload landed), so there is nothing left to cover.
  useEffect(() => {
    if (wanted !== null && wanted === stored) setWanted(null);
  }, [wanted, stored]);

  const flip = (next) => {
    saver.run(async () => {
      // Counted inside, so Retry (which runs this again) is a new ask and not the one that failed.
      const mine = ++latest.current;
      setWanted(next);
      try {
        await adminApi.updateCommunity(token, community.id, { [group]: { [item.k]: next } });
      } catch (error) {
        if (latest.current === mine) setWanted(null);
        throw error;
      }
      // Saved. The community is read again so the page agrees with the server, without the leads list, which a
      // switch never changes and which is by far the biggest part of that read. The new position stays covered
      // until that read lands; if it does not (the signal dropped just after the save), the switch still shows
      // what is saved rather than jumping back to what was.
      reload({ leads: false })
        .then(() => latest.current === mine && setWanted(null))
        .catch(() => {});
    });
  };

  return (
    <div className="card elev-sm ax-switchrow">
      <div className="ax-switchrow__text">
        <div className="card-title" style={{ fontSize: 15 }}>{item.name}</div>
        <div className="text-muted" style={{ fontSize: 14 }}>{item.q}</div>
      </div>
      <span className="ax-switchrow__state" role="status">{saver.saving ? 'Saving…' : ''}</span>
      <Toggle on={shown} busy={saver.saving} onChange={flip} label={`${item.name} enabled`} />
      <SaveNote saver={saver} />
    </div>
  );
}

/** One switch per buyer tool. Turning one off hides it everywhere in the buyer app. */
// What only makes sense for a development: lot numbers, the plat, the builder's own videos and articles, the incentive card.
// A listing is one home: nothing to compare, no community assistance program, no build to plan a move-in around.
const LISTING_TOOLS = ['payment', 'afford', 'loans', 'savings'];
const COMMUNITY_ONLY = ['lotNumbers', 'siteMap', 'resources', 'incentive'];

export default function ToolsTab({ community, reload }) {
  const listing = isListing(community);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="text-muted" style={{ fontSize: 14, margin: '0 0 4px' }}>
        Choose which questions {listing ? 'visitors to this listing' : "this community's buyers"} can answer for themselves.
      </p>
      {TOOLS.filter((tool) => !listing || LISTING_TOOLS.includes(tool.k)).map((tool) => (
        <SwitchRow key={tool.k} item={tool} group="tools" community={community} reload={reload} />
      ))}
      <p className="text-muted" style={{ fontSize: 14, margin: '14px 0 4px' }}>
        What {listing ? 'visitors' : 'buyers'} see on {listing ? 'the home' : 'the homes'} themselves. Each one also stays hidden until you
        add something to it, so switching it on never shows an empty space.
      </p>
      {FEATURES.filter((feature) => feature.k !== 'booking' && !(listing && COMMUNITY_ONLY.includes(feature.k))).map((feature) => (
        <SwitchRow
          key={feature.k} group="features" community={community} reload={reload}
          item={listing && feature.k === 'agents' ? { ...feature, name: 'Meet your agent', q: 'Show your name, photo and contact details on the page, under the home and for a showing request' } : feature}
        />
      ))}
    </div>
  );
}
