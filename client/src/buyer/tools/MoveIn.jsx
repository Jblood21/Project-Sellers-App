import { MOVE_IN_PHASES } from '@shared/domain.js';
import { shortMonthYear } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { Field, PillGroup, SaveToPlan, ToolHeader } from './ToolUI.jsx';

const START_OPTIONS = [
  { value: 0, label: 'ASAP' },
  { value: 3, label: 'In 3 mo' },
  { value: 6, label: 'In 6 mo' },
];

const phaseDate = (startMonths, weekOffset) => {
  const date = new Date();
  date.setDate(date.getDate() + startMonths * 30 + weekOffset * 7);
  return date;
};

const fmt = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "When could I actually get keys?" — offer to closing is about six weeks. */
export default function MoveIn() {
  const { lead, tools, setTool, savePlan, track } = useBuyer();
  const state = tools.movein;

  const phases = MOVE_IN_PHASES.map(([name, weekOffset]) => ({
    name,
    date: fmt(phaseDate(state.startMonths, weekOffset)),
  }));
  const keysDate = phaseDate(state.startMonths, 6);

  // Cross-tool check: a savings plan that lands after closing is a real problem.
  const savingsReady = new Date();
  savingsReady.setMonth(savingsReady.getMonth() + tools.savings.months);
  const savingsConflict = Boolean(lead?.plan?.savings) && savingsReady > keysDate;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader
        title="My Move-In Plan"
        subtitle="These homes are built — from offer to keys is about 6 weeks."
      />

      <div style={{ marginBottom: 14 }}>
        <Field label="When would you make an offer?">
          <PillGroup
            label="Offer timing"
            value={state.startMonths}
            onChange={(startMonths) => {
              setTool('movein', { startMonths });
              track(`Set move-in timing: ${startMonths === 0 ? 'ASAP' : `in ${startMonths} months`}`);
            }}
            options={START_OPTIONS}
          />
        </Field>
      </div>

      {savingsConflict ? (
        <div
          style={{
            background: 'var(--t-tint)', borderRadius: 'var(--t-rad)', padding: '12px 14px',
            marginBottom: 14, fontSize: 12.5, lineHeight: 1.5,
          }}
        >
          Heads up: your savings plan finishes around {shortMonthYear(savingsReady)}, after this closing date.
          Stretch the offer date or shorten the savings plan so they line up.
        </div>
      ) : null}

      <div className="b-card" style={{ padding: '4px 16px', marginBottom: 14 }}>
        {phases.map((phase, index) => (
          <div
            key={phase.name}
            style={{
              display: 'flex', gap: 14, alignItems: 'baseline', padding: '12px 0',
              borderTop: index ? '1px solid var(--t-line)' : 'none',
            }}
          >
            <span style={{ flex: 'none', width: 62, fontSize: 12, fontWeight: 700, color: 'var(--t-acc)' }}>
              {phase.date}
            </span>
            <span style={{ fontSize: 13.5 }}>{phase.name}</span>
          </div>
        ))}
      </div>

      <SaveToPlan
        onSave={() =>
          savePlan(
            'movein',
            `Offer ${state.startMonths === 0 ? 'ASAP' : `in ${state.startMonths} months`} — keys around ${phases[5].date}`,
          )
        }
      />
    </div>
  );
}
