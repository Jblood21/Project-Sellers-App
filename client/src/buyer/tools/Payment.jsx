import { useNavigate, useParams } from 'react-router-dom';

import { PROGRAMS, calcPayment, money, num, ratesOf } from '@shared/domain.js';
import { dateTime } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { BigNumber, Field, PillGroup, ResultCard, ResultRow, SaveToPlan, ToolHeader } from './ToolUI.jsx';

const DOWN_OPTIONS = [3.5, 5, 10, 20];

/** "What would this home really cost each month?" */
export default function Payment() {
  const { homes, lead, settings, tools, setTool, track, savePlan } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  if (!homes.length) {
    return (
      <div className="b-shell" style={{ paddingTop: 20 }}>
        <ToolHeader title="See My Payment" subtitle="What would this home really cost each month?" />
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>
          Homes are still being added to this community — check back soon.
        </p>
      </div>
    );
  }

  const state = tools.pay;
  const home = homes.find((h) => h.id === state.homeId) ?? homes[0];
  const rates = ratesOf(settings);
  const result = calcPayment({ price: home.price, program: state.program, downPct: state.downPct, settings });

  // The down-payment-help checkbox only appears once the DPA screener says "likely".
  const dpaLikely = String(lead?.plan?.dpa ?? '').startsWith('Likely');
  const dpaAmount = num(settings.dpaAmount);
  const cashToClose = Math.max(0, result.cashToClose - (state.dpaOn && dpaLikely ? dpaAmount : 0));

  const save = () => {
    // Saving a payment scenario pre-fills the savings plan's cash target.
    setTool('savings', { cash: String(Math.round(cashToClose)) });
    savePlan(
      'payment',
      `${home.name} · ${PROGRAMS[state.program]} · ${state.downPct}% down · ${money(result.total)}/mo · cash to close ${money(cashToClose)}`,
    );
  };

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader title="See My Payment" subtitle="What would this home really cost each month?" />

      <div style={{ marginBottom: 12 }}>
        <Field label="Which home?">
          <PillGroup
            stack
            label="Which home?"
            value={home.id}
            onChange={(id) => setTool('pay', { homeId: id })}
            options={homes.map((h) => ({ value: h.id, label: h.name, trailing: money(h.price) }))}
          />
        </Field>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Field label="Loan type">
          <PillGroup
            label="Loan type"
            value={state.program}
            onChange={(program) => {
              setTool('pay', { program });
              track(`Explored ${PROGRAMS[program]} loan on payment tool`);
            }}
            options={Object.entries(PROGRAMS).map(([key, label]) => ({
              value: key,
              label: `${label} ${rates[key].toFixed(2)}%`,
            }))}
          />
        </Field>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Field label="Down payment">
          <PillGroup
            label="Down payment"
            value={state.downPct}
            onChange={(downPct) => {
              setTool('pay', { downPct });
              track(`Tested ${downPct}% down on ${home.name}`);
            }}
            options={DOWN_OPTIONS.map((pct) => ({ value: pct, label: `${pct}%` }))}
          />
        </Field>
      </div>

      {dpaLikely ? (
        <button
          type="button"
          onClick={() => setTool('pay', { dpaOn: !state.dpaOn })}
          aria-pressed={state.dpaOn}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'var(--t-tint2)',
            border: 'none', borderRadius: 'var(--t-rad)', padding: '11px 14px', marginBottom: 14,
            cursor: 'pointer', color: 'var(--t-ink)', textAlign: 'left', minHeight: 46,
          }}
        >
          <span
            style={{
              width: 22, height: 22, flex: 'none', borderRadius: 6, border: '1.5px solid var(--t-acc2)',
              background: state.dpaOn ? 'var(--t-acc2)' : 'transparent', color: 'var(--t-onacc2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14,
            }}
          >
            {state.dpaOn ? '✓' : ''}
          </span>
          <span style={{ fontSize: 13 }}>Apply my down payment help ({money(dpaAmount)})</span>
        </button>
      ) : null}

      <ResultCard>
        <span className="b-lbl">Estimated monthly payment</span>
        <BigNumber value={money(result.total)} suffix="/mo" />
        <ResultRow label="Principal &amp; interest" value={money(result.pi)} />
        <ResultRow label="Property taxes" value={money(result.tax)} />
        <ResultRow label="Homeowners insurance" value={money(result.insurance)} />
        <ResultRow label="Mortgage insurance" value={result.mi ? money(result.mi) : 'None'} />
        <ResultRow label="HOA &amp; community fees" value={money(result.hoa)} />
        <ResultRow
          label="Cash to close (down + ~2.5%)"
          value={`${money(cashToClose)}${state.dpaOn && dpaLikely ? ' (after help)' : ''}`}
          bold
        />
        <span style={{ fontSize: 10.5, color: 'var(--t-mut)' }}>
          {PROGRAMS[state.program]} at {result.rate.toFixed(2)}% · 30-year fixed · rates updated{' '}
          {settings.ratesUpdatedAt ? dateTime(settings.ratesUpdatedAt) : 'recently'}
        </span>
      </ResultCard>

      <SaveToPlan onSave={save} />
      <button
        type="button"
        className="b-btn b-btn-outline"
        onClick={() => navigate(`/c/${communityId}/tool/compare`)}
        style={{ marginTop: 8, minHeight: 44, fontSize: 13.5 }}
      >
        Compare My Options →
      </button>
    </div>
  );
}
