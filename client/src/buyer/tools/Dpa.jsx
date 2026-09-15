import { creditRanges, money, num, screenDpa } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import { EmptyPrompt, Field, MoneyInput, PillGroup, SaveToPlan, ToolHeader } from './ToolUI.jsx';

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/** "Could I get help with my down payment?" — five questions, rules from admin Setup. */
export default function Dpa() {
  const { settings, tools, setTool, savePlan, track } = useBuyer();
  const state = tools.dpa;
  const ranges = creditRanges(settings);
  const result = screenDpa({
    income: state.income,
    credit: state.credit,
    firstTime: state.firstTime,
    military: state.military,
    settings,
  });

  const amount = money(num(settings.dpaAmount));
  const limit = money(num(settings.dpaIncomeLimit));

  const copy = {
    likely: {
      title: 'Good news — you may qualify',
      body: `Based on your answers you fit this community’s assistance profile — up to ${amount} toward your down payment. Apply it in See My Payment to watch your cash-to-close drop.`,
      summary: `Likely eligible — up to ${amount}`,
    },
    maybe: {
      title: 'Possibly — worth a conversation',
      body: `You’re near the income limit of ${limit}. Programs change often — the lender can screen you properly in minutes.`,
      summary: 'Borderline — lender screen recommended',
    },
    unlikely: {
      title: 'Less likely — but ask anyway',
      body: `Your answers fall outside the usual limits (income under ${limit}, credit ${settings.dpaMinCredit}+, first-time or military). The lender may still know other programs.`,
      summary: 'Unlikely on current rules',
    },
  };

  const save = () => {
    track(`DPA screener: ${result} eligible`);
    savePlan('dpa', `${copy[result].summary} (income ${money(num(state.income))})`);
  };

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader title="Down Payment Help" subtitle="Could you get help with your down payment? Five quick questions." />

      <div className="b-stack" style={{ gap: 12, marginBottom: 14 }}>
        <Field label="Household income (yearly)">
          <MoneyInput value={state.income} onChange={(income) => setTool('dpa', { income })} placeholder="85,000" />
        </Field>
        <Field label="Current savings">
          <MoneyInput value={state.savings} onChange={(savings) => setTool('dpa', { savings })} placeholder="12,000" />
        </Field>
        <Field label="First-time buyer?">
          <PillGroup
            label="First-time buyer"
            value={state.firstTime}
            onChange={(firstTime) => setTool('dpa', { firstTime })}
            options={YES_NO}
          />
        </Field>
        <Field label="Veteran or active military?">
          <PillGroup
            label="Veteran or active military"
            value={state.military}
            onChange={(military) => setTool('dpa', { military })}
            options={YES_NO}
          />
        </Field>
        <Field label="Credit">
          <PillGroup
            label="Credit"
            value={state.credit}
            onChange={(credit) => setTool('dpa', { credit })}
            options={ranges.map((r) => ({ value: r.k, label: r.label }))}
          />
        </Field>
      </div>

      {result ? (
        <div
          style={{
            background: result === 'likely' ? 'var(--t-tint2)' : 'var(--t-tint)',
            color: 'var(--t-ink)', borderRadius: 'var(--t-radlg)', padding: 18,
            display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14,
          }}
        >
          <span className="b-head" style={{ fontSize: 18 }}>{copy[result].title}</span>
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>{copy[result].body}</span>
        </div>
      ) : (
        <EmptyPrompt>Add your household income above and we&apos;ll screen you against this community&apos;s program.</EmptyPrompt>
      )}

      <SaveToPlan
        onSave={save}
        disabled={!result}
        note="Screening only — the lender confirms actual program eligibility."
      />
    </div>
  );
}
