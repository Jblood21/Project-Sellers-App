import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { groupByBranch, sortBranches } from '../branches.js';

/** From this many communities a box to find one by name sits above the list. */
const FILTER_FROM = 9;

/**
 * A titled group of boxes to tick, as a group the keyboard walks through. `note` is the word beside the group's
 * name after a change (Saved, or why not); its element is always there, so a screen reader hears the word
 * arrive. `hint` is a line under the name saying what ticking does; `empty` is what to show instead of boxes
 * when there is nothing to tick, so the group says so rather than showing nothing.
 */
export function CheckGroup({ legend, note = null, hint = '', empty = null, children }) {
  return (
    <fieldset className="as-access">
      <legend className="as-access__legend">
        {legend}
        <span className={`as-saved${note?.warn ? ' as-saved--warn' : ''}`} role="status">{note?.text ?? ''}</span>
      </legend>
      {hint ? <p className="as-acc__note">{hint}</p> : null}
      {empty ?? <div className="as-checks">{children}</div>}
    </fieldset>
  );
}

const toggle = (list, id, on) => (on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id));

/**
 * What a person can open, in two parts: the branches they are in (every community in those, now and later) and
 * the communities given to them on their own, under their branches' names so the owner sees what a branch would
 * cover. The same two parts serve the invite form and the Edit access pop-up; `compact` is the form, where the
 * boxes go several across. A branch that is ticked says so over its communities below ("all included"), since
 * ticking those one by one adds nothing; they stay tickable, because a tick of their own outlasts the branch.
 * With no branches yet the first part says where to make one.
 */
export default function AccessPicker({ branches, communities, branchIds, communityIds, onChange, compact = false }) {
  const [filter, setFilter] = useState('');
  const idBase = useId();
  const chosenBranches = new Set(branchIds);
  const chosen = new Set(communityIds);
  const needle = filter.trim().toLowerCase();
  const groups = groupByBranch(communities, branches)
    .map((group) => ({ ...group, communities: needle ? group.communities.filter((c) => c.name.toLowerCase().includes(needle)) : group.communities }))
    .filter((group) => group.communities.length > 0);
  // One heading per branch, unless there are no branches at all and the one group would only say "No branch".
  const headed = groups.length > 1 || (groups.length === 1 && groups[0].id !== null);

  return (
    <div className={`as-acc${compact ? ' as-acc--compact' : ''}`}>
      <CheckGroup
        legend="Branches"
        hint="Everything in these branches, now and later."
        empty={branches.length === 0 ? (
          <span className="as-member__line">
            No branches yet. Make one on the <Link to="/admin/branches">Branches</Link> page to give a whole company or group at once.
          </span>
        ) : null}
      >
        {sortBranches(branches).map((branch) => (
          <label key={branch.id} className="as-check">
            <input
              type="checkbox"
              checked={chosenBranches.has(branch.id)}
              onChange={(event) => onChange({ branchIds: toggle(branchIds, branch.id, event.target.checked), communityIds })}
            />
            <span>{branch.name}</span>
          </label>
        ))}
      </CheckGroup>

      <fieldset className="as-access">
        <legend className="as-access__legend">Individual communities</legend>
        <p className="as-acc__note">On their own, whichever branch each is in.</p>
        {communities.length === 0 ? (
          <span className="as-member__line">No communities yet. Once there is one, it can be given here.</span>
        ) : (
          <>
            {communities.length >= FILTER_FROM ? (
              <input
                type="search" className="input as-acc__filter" value={filter} onChange={(event) => setFilter(event.target.value)}
                placeholder="Find a community" aria-label="Find a community" autoComplete="off"
                // On the Team page this box sits inside the invite form, where Enter in a text box submits the form:
                // the invite would go, account made and email sent, with the boxes still to tick. Enter here narrows
                // the list as the person types and does nothing more.
                onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}
              />
            ) : null}
            {groups.map((group) => {
              const headingId = `${idBase}-${group.id ?? 'none'}`;
              const covered = group.id !== null && chosenBranches.has(group.id);
              return (
                <div key={group.id ?? ''} className="as-acc__group" role="group" aria-labelledby={headed ? headingId : undefined}>
                  {headed ? (
                    <span className="as-acc__head" id={headingId}>
                      {group.name}
                      {covered ? <span className="as-acc__covered"> · all included</span> : null}
                    </span>
                  ) : null}
                  <div className="as-checks">
                    {group.communities.map((community) => (
                      <label key={community.id} className="as-check">
                        <input
                          type="checkbox"
                          checked={chosen.has(community.id)}
                          onChange={(event) => onChange({ branchIds, communityIds: toggle(communityIds, community.id, event.target.checked) })}
                        />
                        <span>{community.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {needle && groups.length === 0 ? <span className="as-member__line" role="status">Nothing matches “{filter.trim()}”.</span> : null}
          </>
        )}
      </fieldset>
    </div>
  );
}
