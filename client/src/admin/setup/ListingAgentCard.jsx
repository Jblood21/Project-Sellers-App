import { useState } from 'react';

import { AGENT_MODES, TEAM_NAME_MAX } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { PillRow, SaveNote, useSaving } from '../ui.jsx';
import AgentEditor from './AgentEditor.jsx';
import RealtorsCard from './RealtorsCard.jsx';

const MODES = [
  { value: 'one', label: 'One agent' },
  { value: 'several', label: 'Several agents' },
  { value: 'team', label: 'A team' },
];

/**
 * Who shows the home: one agent (the person who made the listing, edited here), several individual agents, or a team
 * with a name and its members. The choice and the team's name save as soon as they change; each agent saves on its
 * own card. With one agent chosen, buyers see only the first agent; any others stay saved.
 */
export default function ListingAgentCard({ community, reload }) {
  const { token } = useAdmin();
  const agents = community.agents ?? [];
  const agent = agents[0] ?? null;
  const settings = community.settings ?? {};
  const mode = AGENT_MODES.includes(settings.agentMode) ? settings.agentMode : 'one';
  const [notice, setNotice] = useState('');
  const [team, setTeam] = useState(settings.teamName ?? '');
  const saver = useSaving();

  const save = (patch) => saver.run(async () => {
    await adminApi.updateCommunity(token, community.id, { settings: patch });
    await reload();
  });

  return (
    <>
      <div className="card elev-sm" style={{ gap: 12 }}>
        <span className="card-kicker">Listing agents</span>
        <PillRow label="Who shows this home" value={mode} onChange={(value) => save({ agentMode: value })} options={MODES} />
        <SaveNote saver={saver} />
        {mode === 'team' ? (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Team name</span>
            <input
              className="input" value={team} maxLength={TEAM_NAME_MAX} placeholder="e.g. The Whitcombe Group"
              onChange={(event) => setTeam(event.target.value)}
              onBlur={() => { if (team.trim() !== (settings.teamName ?? '')) save({ teamName: team }); }}
            />
          </label>
        ) : null}
        {mode === 'one' && agents.length > 1 ? (
          <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 14 }}>
            Buyers see only {agent?.name || 'the first agent'}. The other {agents.length - 1 === 1 ? 'agent stays' : 'agents stay'} saved:
            choose Several agents or A team to show them.
          </p>
        ) : null}
      </div>

      {mode === 'one' ? (
        <div className="card elev-sm" style={{ gap: 12 }}>
          <span className="card-kicker">Agent</span>
          <AgentEditor
            key={agent?.id ?? 'new'} single agent={agent} index={0} community={community} reload={reload}
            onCreated={setNotice}
          />
          {notice ? <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 14 }}>{notice}</p> : null}
        </div>
      ) : (
        <RealtorsCard community={community} reload={reload} />
      )}
    </>
  );
}
