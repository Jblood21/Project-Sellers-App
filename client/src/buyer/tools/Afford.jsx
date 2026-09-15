import {
  affordabilityLevers, calcAffordability, creditRanges, money, num,
} from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import {
  BigNumber, EmptyPrompt, Field, MoneyInput, PillGroup, ResultCard, SaveToPlan, ToolHeader,
} from './ToolUI.jsx';

/** "What price range fits my income?" */
export default function Afford() {
  const { homes, settings, tools, setTool, savePlan } = useBuyer();
  const state = tools.aff;
  const ranges = creditRanges(settings);
  const hasIncome = num(state.income) > 0;
  const hasCash = String(state.downPayment).trim() !== '';
  const result = calcAffordability({
    income: state.income,
    debts: state.debts,
    credit: state.credit,
    settings,
    downPayment: hasCash ? state.downPayment : null,
  });

  const levers = affordabilityLevers({
    income: state.income,
    debts: state.debts,
    credit: state.credit,
    settings,
    downPayment: hasCash ? state.downPayment : null,
    dpaAmount: settings.dpaAmount,
  });

  const save = () =>
    savePlan(
      'afford',
      `Looking at ${money(result.comfortable.price)}–${money(result.lenderMax.price)} (${ranges
        .find((r) => r.k === state.credit)
        .label.toLowerCase()} credit, from ${money(result.comfortable.maxPayment)}/mo)`,
    );

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader title="See What I Can Afford" subtitle="Let's start with a few numbers — no paperwork." />

      <div className="b-stack" style={{ gap: 12, marginBottom: 14 }}>
        <Field label="Household income (yearly)">
          <MoneyInput value={state.income} onChange={(income) => setTool('aff', { income })} placeholder="85,000" />
        </Field>
        <Field label="Monthly debt payments (cars, cards, loans)">
          <MoneyInput value={state.debts} onChange={(debts) => setTool('aff', { debts })} placeholder="450" />
        </Field>
        <Field label="Credit">
          <PillGroup
            label="Credit"
            value={state.credit}
            onChange={(credit) => setTool('aff', { credit })}
            options={ranges.map((r) => ({ value: r.k, label: r.label }))}
          />
        </Field>
        <Field
          label="Down payment you could make"
          hint={
            hasCash
              ? 'Every dollar here raises the price you can reach by a dollar.'
              : 'Leave blank and we assume 5% down.'
          }
        >
          <MoneyInput
            value={state.downPayment}
            onChange={(downPayment) => setTool('aff', { downPayment })}
            placeholder="20,000"
          />
        </Field>
      </div>

      {hasIncome ? (
        <>
          <ResultCard style={{ gap: 6 }}>
            <span className="b-lbl">Homes you could look at</span>
            <span className="b-head" style={{ fontSize: 28, lineHeight: 1.15 }}>
              {money(result.comfortable.price)}
              <span style={{ color: 'var(--t-mut)', fontWeight: 400 }}> to </span>
              {money(result.lenderMax.price)}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
              The lower number is the comfortable end — about {money(result.comfortable.maxPayment)}/mo
              including taxes and insurance. The higher end is what lenders here will often approve,
              at {money(result.lenderMax.maxPayment)}/mo, which leaves less room in your budget each
              month. Both assume{' '}
              {hasCash ? `${money(result.comfortable.down)} down` : '5% down'} at{' '}
              {result.rate.toFixed(2)}%.
            </span>
          </ResultCard>

          {homes.length ? (
            <div className="b-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <span className="b-lbl">How the homes here fit</span>
              {homes.map((home) => {
                const inRange = home.price <= result.comfortable.price;
                const close = !inRange && home.price <= result.lenderMax.price;
                return (
                  <div
                    key={home.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13.5 }}
                  >
                    <span>
                      {home.name} <span style={{ color: 'var(--t-mut)', fontSize: 12 }}>{money(home.price)}</span>
                    </span>
                    <span
                      style={{
                        flex: 'none', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                        background: inRange ? 'var(--t-tint2)' : 'var(--t-tint)',
                        color: inRange ? 'var(--t-acc2)' : 'var(--t-mut)',
                      }}
                    >
                      {inRange ? 'In reach' : close ? 'Worth asking' : 'A stretch for now'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {levers.length ? (
            <div
              className="b-card"
              style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}
            >
              <span className="b-lbl">What would move this number</span>
              {levers.map((lever) => (
                <div
                  key={lever.key}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}
                >
                  <span style={{ lineHeight: 1.4 }}>{lever.label}</span>
                  <span style={{ flex: 'none', fontWeight: 700, color: 'var(--t-acc2)' }}>
                    +{money(lever.delta)}
                  </span>
                </div>
              ))}
              <span style={{ fontSize: 11.5, color: 'var(--t-mut)', lineHeight: 1.45 }}>
                These add up. A lender can also count income this tool never asked about — overtime,
                a second job, a co-borrower — so the range above is a starting point, not a limit.
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyPrompt>Add your household income above and we&apos;ll show what that buys here.</EmptyPrompt>
      )}

      <SaveToPlan onSave={save} disabled={!hasIncome} note="Estimate only — not a loan offer or pre-approval." />
    </div>
  );
}
