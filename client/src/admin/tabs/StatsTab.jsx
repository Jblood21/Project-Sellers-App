import { PLAN_LABELS, planProgress } from '@shared/domain.js';
import { Spinner } from '../ui.jsx';

export default function StatsTab({ community, leads }) {
  if (!leads) return <Spinner label="Loading stats…" />;

  const saveCounts = {};
  for (const lead of leads) {
    for (const id of lead.savedHomeIds) saveCounts[id] = (saveCounts[id] ?? 0) + 1;
  }
  const topHomeEntry = Object.entries(saveCounts).sort((a, b) => b[1] - a[1])[0];
  const topHome = topHomeEntry ? community.homes.find((h) => h.id === topHomeEntry[0]) : null;

  const toolCounts = {};
  for (const lead of leads) {
    for (const key of Object.keys(lead.plan ?? {})) toolCounts[key] = (toolCounts[key] ?? 0) + 1;
  }
  const topToolEntry = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0];

  const averageProgress = leads.length
    ? Math.round(leads.reduce((total, lead) => total + planProgress(lead), 0) / leads.length)
    : 0;

  const cards = [
    { label: 'Total leads', value: leads.length },
    { label: 'New — to call', value: leads.filter((lead) => lead.status === 'new').length },
    { label: 'Tour requests', value: leads.filter((lead) => lead.tour).length },
    { label: 'Avg plan progress', value: `${averageProgress}%` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid-2">
        {cards.map((card) => (
          <div key={card.label} className="card elev-sm" style={{ gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 800 }}>{card.value}</span>
            <span className="text-muted" style={{ fontSize: 12.5 }}>{card.label}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <span className="card-kicker">Most saved home</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{topHome ? topHome.name : 'No saves yet'}</span>
          <span className="text-muted">{topHomeEntry ? `${topHomeEntry[1]} ★` : '—'}</span>
        </div>
      </div>
      <div className="card">
        <span className="card-kicker">Most used tool</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>
            {topToolEntry ? PLAN_LABELS[topToolEntry[0]] ?? 'Tool' : 'No tool use yet'}
          </span>
          <span className="text-muted">{topToolEntry ? `${topToolEntry[1]} leads` : '—'}</span>
        </div>
      </div>
    </div>
  );
}
