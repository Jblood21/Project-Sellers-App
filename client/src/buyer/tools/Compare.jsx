import { PROGRAMS, calcPayment, money } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import { Field, PillGroup, SaveToPlan, ToolHeader } from './ToolUI.jsx';

const DOWN_OPTIONS = [3.5, 5, 10, 20];

/** "Which loan option fits me best?" — two scenarios, side by side. */
export default function Compare() {
  const { homes, settings, tools, setTool, track, savePlan } = useBuyer();
  const state = tools.compare;

  if (!homes.length) {
    return (
      <div className="b-shell" style={{ paddingTop: 20 }}>
        <ToolHeader title="Compare My Options" subtitle="Which loan option fits me best?" />
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>We’re still adding homes to this community. Check back soon.</p>
      </div>
    );
  }

  const home = homes.find((h) => h.id === tools.pay.homeId) ?? homes[0];
  const a = calcPayment({ price: home.price, program: state.aProgram, downPct: state.aDown, settings });
  const b = calcPayment({ price: home.price, program: state.bProgram, downPct: state.bDown, settings });
  const difference = Math.abs(a.total - b.total);
  const cheaper = a.total < b.total ? 'A' : 'B';

  const rows = [
    ['Rate', `${a.rate.toFixed(2)}%`, `${b.rate.toFixed(2)}%`],
    ['Down payment', money(a.down), money(b.down)],
    ['Cash to close', money(a.cashToClose), money(b.cashToClose)],
    ['Monthly payment', money(a.total), money(b.total)],
    ['Mortgage insurance', a.mi ? `${money(a.mi)}/mo` : 'None', b.mi ? `${money(b.mi)}/mo` : 'None'],
    ['Loan amount', money(a.loan), money(b.loan)],
  ];

  const side = (tag, programKey, downKey) => (
    <div className="b-stack" style={{ flex: 1, gap: 8, minWidth: 0 }}>
      <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>Option {tag}</span>
      <Field label="Loan type">
        <PillGroup
          label={`Option ${tag} loan type`}
          value={state[programKey]}
          onChange={(value) => {
            setTool('compare', { [programKey]: value });
            track(`Compared ${PROGRAMS[value]}`);
          }}
          options={Object.entries(PROGRAMS).map(([key, label]) => ({ value: key, label }))}
        />
      </Field>
      <Field label="Down payment">
        <PillGroup
          label={`Option ${tag} down payment`}
          value={state[downKey]}
          onChange={(value) => setTool('compare', { [downKey]: value })}
          options={DOWN_OPTIONS.map((pct) => ({ value: pct, label: `${pct}%` }))}
        />
      </Field>
    </div>
  );

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader title="Compare My Options" subtitle={`Two options for ${home.name}, side by side.`} />

      <div className="b-stack" style={{ gap: 16, marginBottom: 14 }}>
        {side('A', 'aProgram', 'aDown')}
        {side('B', 'bProgram', 'bDown')}
      </div>

      <div className="b-card" style={{ padding: '14px 16px', marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingBottom: 8 }} />
              <th style={{ textAlign: 'right', paddingBottom: 8, fontSize: 11.5, color: 'var(--t-mut)' }}>A</th>
              <th style={{ textAlign: 'right', paddingBottom: 8, fontSize: 11.5, color: 'var(--t-mut)' }}>B</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, valueA, valueB]) => (
              <tr key={label}>
                <td style={{ padding: '7px 0', borderTop: '1px solid var(--t-line)', color: 'var(--t-mut)' }}>{label}</td>
                <td style={{ padding: '7px 0', borderTop: '1px solid var(--t-line)', textAlign: 'right', fontWeight: 600 }}>{valueA}</td>
                <td style={{ padding: '7px 0', borderTop: '1px solid var(--t-line)', textAlign: 'right', fontWeight: 600 }}>{valueB}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '0 0 14px' }}>
        Option {cheaper} costs {money(difference)} less each month, but check the cash you’d need up front too.
      </p>

      <SaveToPlan
        onSave={() =>
          savePlan(
            'compare',
            `${PROGRAMS[state.aProgram]} ${state.aDown}% vs ${PROGRAMS[state.bProgram]} ${state.bDown}% on ${home.name} — option ${cheaper} costs ${money(difference)}/mo less`,
          )
        }
      />
    </div>
  );
}
