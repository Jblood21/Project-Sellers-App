import { calcAffordability, creditRanges, money, num } from '@shared/domain.js';
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
  const result = calcAffordability({
    income: state.income,
    debts: state.debts,
    credit: state.credit,
    settings,
  });

  const save = () =>
    savePlan(
      'afford',
      `Can afford about ${money(result.buyingPower)} (${ranges
        .find((r) => r.k === state.credit)
        .label.toLowerCase()} credit, budget ${money(result.maxPayment)}/mo)`,
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
      </div>

      {hasIncome ? (
        <>
          <ResultCard style={{ gap: 6 }}>
            <span className="b-lbl">You could afford about</span>
            <BigNumber value={money(result.buyingPower)} />
            <span style={{ fontSize: 12.5, color: 'var(--t-mut)' }}>
              with 5% down · budget {money(result.maxPayment)}/mo incl. taxes &amp; insurance · at{' '}
              {result.rate.toFixed(2)}%
            </span>
          </ResultCard>

          {homes.length ? (
            <div className="b-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <span className="b-lbl">How the homes here fit</span>
              {homes.map((home) => {
                const inRange = home.price <= result.buyingPower;
                const close = !inRange && home.price <= result.buyingPower * 1.1;
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
                      {inRange ? 'In range' : close ? 'Close' : 'Stretch'}
                    </span>
                  </div>
                );
              })}
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
