import { PROGRAMS, PROGRAM_DESCRIPTIONS, creditRanges, ratesOf, suggestPrograms } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import { Field, PillGroup, SaveToPlan, ToolHeader } from './ToolUI.jsx';

/** "What financing could work for me?" — two paths: pick one, or be guided. */
export default function Loans() {
  const { settings, tools, setTool, track, savePlan } = useBuyer();
  const state = tools.loans;
  const rates = ratesOf(settings);
  const ranges = creditRanges(settings);
  const suggested = suggestPrograms({ veteran: state.veteran, downPct: state.downPct, credit: state.credit });

  const save = () => {
    const summary =
      state.path === 'know'
        ? state.picked
          ? `${PROGRAMS[state.picked]} at ${rates[state.picked].toFixed(2)}%`
          : 'Reviewed all programs'
        : `${suggested.map((s) => PROGRAMS[s.k]).join(' or ')} suggested`;
    savePlan('loans', summary);
  };

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader title="Find My Loan Options" subtitle="What financing could work for you?" />

      <div style={{ marginBottom: 14 }}>
        <PillGroup
          label="How would you like to start?"
          value={state.path}
          onChange={(path) => setTool('loans', { path })}
          options={[
            { value: 'know', label: 'I know what I want' },
            { value: 'help', label: 'Help me choose' },
          ]}
        />
      </div>

      {state.path === 'know' ? (
        <div className="b-stack" style={{ gap: 10, marginBottom: 14 }}>
          {Object.entries(PROGRAMS).map(([key, name]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTool('loans', { picked: key });
                track(`Explored ${name} loan`);
              }}
              aria-pressed={state.picked === key}
              style={{
                cursor: 'pointer', background: 'var(--t-sur)', textAlign: 'left', color: 'var(--t-ink)',
                border: `1.5px solid ${state.picked === key ? 'var(--t-acc)' : 'var(--t-line)'}`,
                borderRadius: 'var(--t-radlg)', padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="b-head" style={{ fontSize: 16 }}>{name}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-acc)' }}>
                  {rates[key].toFixed(2)}%
                </span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--t-mut)', lineHeight: 1.45 }}>
                {PROGRAM_DESCRIPTIONS[key]}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="b-stack" style={{ gap: 12, marginBottom: 14 }}>
            <Field label="Are you a veteran or active military?">
              <PillGroup
                label="Veteran or active military"
                value={state.veteran}
                onChange={(veteran) => setTool('loans', { veteran })}
                options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              />
            </Field>
            <Field label="How much could you put down?">
              <PillGroup
                label="Down payment"
                value={state.downPct}
                onChange={(downPct) => setTool('loans', { downPct })}
                options={[
                  { value: 0, label: '0–3%' },
                  { value: 5, label: '3–5%' },
                  { value: 10, label: '10%+' },
                ]}
              />
            </Field>
            <Field label="Credit">
              <PillGroup
                label="Credit"
                value={state.credit}
                onChange={(credit) => setTool('loans', { credit })}
                options={ranges.map((r) => ({ value: r.k, label: r.label }))}
              />
            </Field>
          </div>

          <div className="b-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            <span className="b-lbl">Programs that may fit you</span>
            {suggested.map((item) => (
              <div key={item.k} className="b-stack" style={{ gap: 4 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="b-head" style={{ fontSize: 16 }}>{PROGRAMS[item.k]}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-acc)' }}>
                    {rates[item.k].toFixed(2)}%
                  </span>
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--t-mut)', lineHeight: 1.45 }}>{item.why}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SaveToPlan onSave={save} note="The lender confirms which programs you actually qualify for." />
    </div>
  );
}
