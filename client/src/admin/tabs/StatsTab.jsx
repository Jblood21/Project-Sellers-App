import { PLAN_LABELS, isArchived, toolsUsedOf } from '@shared/domain.js';
import PdfReportButton from '../PdfReportButton.jsx';
import { Spinner } from '../ui.jsx';

export default function StatsTab({ community, leads: everyone }) {
  if (!everyone) return <Spinner label="Loading stats…" />;
  // People the team has closed are counted nowhere here, as in the reports.
  const leads = everyone.filter((lead) => !isArchived(lead));

  const saveCounts = {};
  for (const lead of leads) {
    for (const id of lead.savedHomeIds) saveCounts[id] = (saveCounts[id] ?? 0) + 1;
  }
  const topHomeEntry = Object.entries(saveCounts).sort((a, b) => b[1] - a[1])[0];
  const topHome = topHomeEntry ? community.homes.find((h) => h.id === topHomeEntry[0]) : null;

  // A tool counts for a person once they used it (opened it or worked in it), whether or not they kept its answer.
  const toolCounts = {};
  for (const lead of leads) {
    for (const key of toolsUsedOf(lead)) toolCounts[key] = (toolCounts[key] ?? 0) + 1;
  }
  const topToolEntry = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0];

  const cards = [
    { label: 'Total leads', value: leads.length },
    { label: 'New — to call', value: leads.filter((lead) => lead.status === 'new').length },
    { label: 'Booked calls', value: leads.filter((lead) => lead.tour).length },
    { label: 'Used a tool', value: leads.filter((lead) => toolsUsedOf(lead).length > 0).length },
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
          <span className="text-muted">{topToolEntry ? `${topToolEntry[1]} ${topToolEntry[1] === 1 ? 'person' : 'people'}` : '—'}</span>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>People you have closed are not counted.</p>
      <div className="card">
        <PdfReportButton
          community={community}
          title="Leads report (PDF)"
          note="A summary, what people did, the calls waiting and everyone, as a file to keep or print."
        />
      </div>
    </div>
  );
}
