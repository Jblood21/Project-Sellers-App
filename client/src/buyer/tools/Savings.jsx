import { calcPayment, money, num } from '@shared/domain.js';
import { monthYear, shortMonthYear } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import {
  BigNumber, EmptyPrompt, Field, MoneyInput, PillGroup, ResultCard, ResultRow, SaveToPlan, ToolHeader,
} from './ToolUI.jsx';

const MONTH_OPTIONS = [6, 12, 18, 24];

/** "How do I save what I need in time?" — cash target pre-filled by the payment tool. */
export default function Savings() {
  const { homes, settings, tools, setTool, savePlan } = useBuyer();
  const state = tools.savings;

  // Fall back to the current payment scenario when the buyer hasn't saved one yet.
  const scenarioHome = homes.find((h) => h.id === tools.pay.homeId) ?? homes[0];
  const scenarioCash = scenarioHome
    ? calcPayment({
        price: scenarioHome.price,
        program: tools.pay.program,
        downPct: tools.pay.downPct,
        settings,
      }).cashToClose
    : 0;

  const cashValue = state.cash === '' ? String(Math.round(scenarioCash)) : state.cash;
  const cash = num(cashValue);
  const current = num(state.current);
  const remaining = Math.max(0, cash - current);
  const perMonth = remaining / state.months;
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + state.months);
  const percent = cash ? Math.min(100, Math.round((current / cash) * 100)) : 0;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader title="My Savings Plan" subtitle="How much do you need, and how do you get there?" />

      <div className="b-stack" style={{ gap: 12, marginBottom: 14 }}>
        <Field
          label="Cash you'll need (down + closing)"
          hint={
            state.cash
              ? 'Your number — edit anytime.'
              : scenarioHome
                ? `Pre-filled from your payment scenario on ${scenarioHome.name}.`
                : 'Run See My Payment first and we’ll fill this in.'
          }
        >
          <MoneyInput value={cashValue} onChange={(value) => setTool('savings', { cash: value })} placeholder="30,000" />
        </Field>
        <Field label="Current savings">
          <MoneyInput value={state.current} onChange={(value) => setTool('savings', { current: value })} placeholder="12,000" />
        </Field>
        <Field label="When do you want to move in?">
          <PillGroup
            label="Months until move-in"
            value={state.months}
            onChange={(months) => setTool('savings', { months })}
            options={MONTH_OPTIONS.map((m) => ({ value: m, label: `${m} mo` }))}
          />
        </Field>
      </div>

      {cash > 0 ? (
        <ResultCard>
          <span className="b-lbl">Save each month</span>
          <BigNumber value={money(perMonth)} suffix="/mo" />
          <ResultRow label="Still to save" value={money(remaining)} />
          <ResultRow label="Target date" value={monthYear(targetDate)} />
          <div className="b-bar" style={{ marginTop: 4 }}><span style={{ width: `${percent}%` }} /></div>
          <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>
            You already have {percent}% of what you need.
          </span>
        </ResultCard>
      ) : (
        <EmptyPrompt>Enter the cash you&apos;ll need and we&apos;ll work out the monthly number.</EmptyPrompt>
      )}

      <SaveToPlan
        disabled={!cash}
        onSave={() =>
          savePlan(
            'savings',
            `Save ${money(perMonth)}/mo for ${state.months} months — ${money(remaining)} to go, ready by ${shortMonthYear(targetDate)}`,
          )
        }
      />
    </div>
  );
}
