import { creditRanges, dpaHomes, money, num, screenDpa } from '@shared/domain.js';
import { shortDate } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { EmptyPrompt, Field, MoneyInput, PillGroup, SaveToPlan, ToolHeader } from './ToolUI.jsx';

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/**
 * "Could I get help with my down payment?" — five questions, rules from admin
 * Setup.
 *
 * Two separate questions are answered here, because a real program asks two
 * separate things. Does the BUYER qualify (income, credit, first-time)? And
 * does the HOME qualify — programs aimed at new construction commonly stop at
 * a purchase price, which on a board of three plans may rule out two of them
 * no matter how well the buyer screens. Running them together would tell an
 * eligible buyer they are not eligible, and hide the one fact the builder
 * knows and the buyer cannot work out on their own.
 */
export default function Dpa() {
  const { community, homes, settings, tools, setTool, savePlan, track } = useBuyer();
  const state = tools.dpa;
  const ranges = creditRanges(settings);
  const result = screenDpa({
    income: state.income,
    credit: state.credit,
    firstTime: state.firstTime,
    military: state.military,
    settings,
  });

  const { cap, within, over } = dpaHomes(homes, settings);
  const program = String(settings.dpaProgram ?? '').trim();
  const pct = num(settings.dpaPct);
  const flat = num(settings.dpaAmount);
  const limit = money(num(settings.dpaIncomeLimit));

  // A percentage is worth a different figure on every home, and this screen
  // never asks for a down payment — so it states the rule and leaves the exact
  // dollar to See My Payment, which knows both the home and the down payment.
  const amount = pct > 0
    ? `${pct}% of your loan${flat > 0 ? `, up to ${money(flat)}` : ''}`
    : money(flat);

  const named = program || 'this community’s assistance program';
  // Eligible on paper, but nothing here is under the ceiling. Saying "good
  // news" alone would be a promise the price board cannot keep.
  const noneFit = cap !== null && !within.length;

  const copy = {
    likely: {
      title: noneFit ? 'You may qualify — but not on these homes' : 'Good news — you may qualify',
      body: noneFit
        ? `Your answers fit ${named}, which is worth ${amount}. The catch is the price: it only covers homes under ${money(cap)}, and every home here is above that today. Worth asking the team what else is coming.`
        : `Based on your answers you fit ${named} — worth ${amount} toward your down payment. Apply it in See My Payment to watch your cash-to-close drop.`,
      summary: noneFit
        ? `Likely eligible (${amount}) — no home here under ${money(cap)}`
        : `Likely eligible — ${amount}`,
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
            // The theme's own wash for the outcome worth having; the neutral
            // one for the two that are not. It used to be the other way round,
            // which painted "good news" grey in every palette.
            background: result === 'likely' && !noneFit ? 'var(--t-tint)' : 'var(--t-tint2)',
            color: 'var(--t-ink)', borderRadius: 'var(--t-radlg)', padding: 18,
            display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14,
          }}
        >
          <span
            className="b-head"
            style={{ fontSize: 18, color: result === 'likely' && !noneFit ? 'var(--t-accT)' : 'var(--t-ink)' }}
          >
            {copy[result].title}
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>{copy[result].body}</span>
        </div>
      ) : (
        <EmptyPrompt>Add your household income above and we&apos;ll screen you against this community&apos;s program.</EmptyPrompt>
      )}

      {cap !== null && (within.length || over.length) ? (
        <div style={{ marginBottom: 14 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 4, color: 'var(--t-accT)' }}>
            Which homes the help covers
          </span>
          <p style={{ margin: '0 0 10px', color: 'var(--t-mut)', fontSize: 12.5, lineHeight: 1.5 }}>
            {program ? `${program} stops` : 'This program stops'} at {money(cap)}, whatever your income.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...within, ...over].map((home) => {
              const covered = num(home.price) <= cap;
              return (
                <div
                  key={home.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    background: 'var(--t-sur)', border: '1px solid var(--t-line)',
                    borderRadius: 'var(--t-rad)', padding: '10px 14px', fontSize: 13.5,
                  }}
                >
                  <span>
                    <strong style={{ color: covered ? 'var(--t-accT)' : 'var(--t-ink)' }}>{home.name}</strong>
                    <span style={{ color: 'var(--t-mut)' }}> · {money(home.price)}</span>
                  </span>
                  <span
                    style={{
                      flex: 'none', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                      background: covered ? 'var(--t-tint)' : 'var(--t-tint2)',
                      color: covered ? 'var(--t-accT)' : 'var(--t-mut)',
                    }}
                  >
                    {covered ? 'Covered' : `Over by ${money(num(home.price) - cap)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <SaveToPlan
        onSave={save}
        disabled={!result}
        note={
          settings.dpaAsOf
            ? `Screening only — the lender confirms actual program eligibility. ${community?.builder || 'The builder'} last checked these rules ${shortDate(settings.dpaAsOf)}; limits reset and funded programs run out.`
            : 'Screening only — the lender confirms actual program eligibility.'
        }
      />
    </div>
  );
}
