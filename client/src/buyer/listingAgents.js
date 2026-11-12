import { AGENT_MODES } from '@shared/domain.js';

/**
 * Who a buyer is shown as the people to call about a listing. An agent chose one agent, several, or a team:
 * with one, only the first agent is shown (the rest stay saved but hidden); with several or a team, all of them.
 * `title` is the line above them, or '' for a single agent, who needs none.
 */
export function listingAgentsOf({ agents = [], settings = {}, isListing = false }) {
  const mode = AGENT_MODES.includes(settings.agentMode) ? settings.agentMode : 'one';
  if (!isListing) return { mode: 'one', list: agents, title: '', teamName: '' };
  if (mode === 'one') return { mode, list: agents.slice(0, 1), title: '', teamName: '' };
  const teamName = String(settings.teamName ?? '').trim();
  if (mode === 'team') return { mode, list: agents, title: teamName ? `Listed by ${teamName}` : 'Your listing team', teamName };
  return { mode, list: agents, title: agents.length > 1 ? 'Your listing agents' : '', teamName: '' };
}
