import {
  MAX_SCENARIOS, RATE_SCENARIOS, SCENARIO_ASSUMPTIONS_MAX, picksOf, scenarioAprKey, scenarioRateKey,
} from '@shared/rateScenarios.js';

/**
 * The sample loan solutions on Setup: the effective date, the line that says whose situation the figures are based
 * on, and for each of the five solutions a tick to show it (up to three), its rate and its APR. A ticked solution
 * with no rate is not shown to visitors, and says so here. The boxes are Setup's own (`numberField`), so they are
 * checked and saved with the rest of the settings.
 */
export default function ScenarioFields({ settings, set, numberField }) {
  const picks = picksOf(settings.scenarioPicks);
  const full = picks.length >= MAX_SCENARIOS;
  const toggle = (k) => {
    const next = picks.includes(k) ? picks.filter((p) => p !== k) : [...picks, k];
    set('scenarioPicks')(next.join(','));
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontWeight: 600 }}>Rates effective on</span>
        <input
          type="date" className="input" value={settings.scenarioEffective ?? ''} style={{ maxWidth: 220 }}
          onChange={(event) => set('scenarioEffective')(event.target.value)}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontWeight: 600 }}>Assumptions</span>
        <textarea
          className="input" rows={3} maxLength={SCENARIO_ASSUMPTIONS_MAX} value={settings.scenarioAssumptions ?? ''}
          onChange={(event) => set('scenarioAssumptions')(event.target.value)}
        />
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>Loan solutions to show (pick up to {MAX_SCENARIOS})</legend>
        {RATE_SCENARIOS.map((scenario) => {
          const on = picks.includes(scenario.k);
          const missing = on && !String(settings[scenarioRateKey(scenario.k)] ?? '').trim();
          return (
            <div key={scenario.k} style={{ display: 'grid', gap: 8, padding: '10px 12px', border: '1px solid var(--line, #d9d9d9)', borderRadius: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(scenario.k)}
                  style={{ width: 22, height: 22 }}
                />
                <span style={{ fontWeight: 600 }}>{scenario.label}{scenario.note ? ` (${scenario.note})` : ''}</span>
              </label>
              <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                {numberField(scenarioRateKey(scenario.k), 'Rate %', { placeholder: '6.250' })}
                {numberField(scenarioAprKey(scenario.k), 'APR %', { placeholder: '6.612' })}
              </div>
              {missing ? <span role="status" style={{ fontSize: 13 }}>Type a rate, or visitors will not see this one.</span> : null}
            </div>
          );
        })}
        {full ? <span style={{ fontSize: 13 }}>Three are showing. Untick one to pick another.</span> : null}
      </fieldset>
    </div>
  );
}
