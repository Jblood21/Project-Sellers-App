import { featureLabel, pricePerSqft } from '@shared/homeFacts.js';
import { money } from '@shared/domain.js';
import { HOME_NUMBER_RULES, readNumber } from '@shared/numberInput.js';
import CheckedField from '../setup/CheckedField.jsx';
import { PillRow } from '../ui.jsx';

/** The optional facts of a home as the boxes hold them: text, so a blank stays a blank and is never sent as 0. */
export const FACTS_BLANK = {
  yearBuilt: '', lotAcres: '',
  hoaMode: '', hoaAmount: '', // hoaMode: '' not given, 'none', or 'monthly'
  taxMode: 'pct', taxAmount: '', // taxMode: 'pct' (percent of price) or 'annual' (dollars a year)
  features: [],
};

const text = (n) => (n === null || n === undefined ? '' : String(n));

/** The boxes as a saved home fills them. */
export function factsSeed(home) {
  const hoa = home?.hoaMonthly;
  const hasPct = home?.taxPct !== null && home?.taxPct !== undefined;
  const hasAnnual = !hasPct && home?.taxAnnual !== null && home?.taxAnnual !== undefined;
  return {
    yearBuilt: text(home?.yearBuilt),
    lotAcres: text(home?.lotAcres),
    hoaMode: hoa === null || hoa === undefined ? '' : Number(hoa) === 0 ? 'none' : 'monthly',
    hoaAmount: Number(hoa) > 0 ? text(hoa) : '',
    taxMode: hasAnnual ? 'annual' : 'pct',
    taxAmount: hasPct ? text(home.taxPct) : hasAnnual ? text(home.taxAnnual) : '',
    features: (Array.isArray(home?.features) ? home.features : []).filter((key) => featureLabel(key)),
  };
}

/** What goes to the server: every box, a blank as '' (not given), and one tax figure with '' for the other. */
export function factsBody(facts) {
  const clean = (v) => String(v ?? '').trim();
  return {
    yearBuilt: clean(facts.yearBuilt),
    lotAcres: clean(facts.lotAcres),
    hoaMonthly: facts.hoaMode === 'none' ? 'none' : facts.hoaMode === 'monthly' ? clean(facts.hoaAmount) : '',
    taxPct: facts.taxMode === 'pct' ? clean(facts.taxAmount) : '',
    taxAnnual: facts.taxMode === 'annual' ? clean(facts.taxAmount) : '',
    features: facts.features,
  };
}

/** Whether the facts differ from `base` (as sent, so "6" typed over "6" is not a change). */
export function factsChanged(facts, base) {
  return JSON.stringify(factsBody(facts)) !== JSON.stringify(factsBody(base));
}

/**
 * The "Details" boxes. `facts` is the form's facts object and `onChange` takes the whole new one. The server judges
 * the figures and its sentence is shown where the form shows any save error, so nothing is judged here.
 */
export default function HomeFactsFields({ facts, onChange }) {
  const set = (key) => (value) => onChange({ ...facts, [key]: value });
  return (
    <div role="group" aria-labelledby="home-details-label" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span id="home-details-label" className="ax-plain" style={{ fontWeight: 700 }}>Details</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <CheckedField
          id="home-yearBuilt" label="Year built" value={facts.yearBuilt} inputMode="numeric" autoComplete="off"
          onChange={set('yearBuilt')}
        />
        <CheckedField
          id="home-lotAcres" label="Lot size (acres)" value={facts.lotAcres} inputMode="decimal" autoComplete="off"
          onChange={set('lotAcres')}
        />
      </div>
      <div className="field">
        <span className="ax-plain" id="home-hoa-label">HOA</span>
        <PillRow
          label="HOA"
          options={[{ value: 'none', label: 'None' }, { value: 'monthly', label: 'Monthly $' }]}
          value={facts.hoaMode}
          // Tapping the one that is on puts it back to "not given".
          onChange={(mode) => onChange({ ...facts, hoaMode: facts.hoaMode === mode ? '' : mode })}
        />
        {facts.hoaMode === 'monthly' ? (
          <input
            id="home-hoaAmount" className="input" aria-label="HOA dollars per month" inputMode="decimal" autoComplete="off"
            placeholder="$ per month" value={facts.hoaAmount} onChange={(event) => set('hoaAmount')(event.target.value)}
          />
        ) : null}
      </div>
      <div className="field">
        <span className="ax-plain">Property tax (used for the payment estimate)</span>
        <PillRow
          label="Property tax"
          options={[{ value: 'pct', label: '% of price' }, { value: 'annual', label: '$ per year' }]}
          value={facts.taxMode}
          onChange={(mode) => onChange({ ...facts, taxMode: mode })}
        />
        <input
          id="home-taxAmount" className="input" inputMode="decimal" autoComplete="off"
          aria-label={facts.taxMode === 'pct' ? 'Property tax, percent of price' : 'Property tax, dollars per year'}
          placeholder={facts.taxMode === 'pct' ? 'e.g. 0.55' : 'e.g. 2800'}
          value={facts.taxAmount} onChange={(event) => set('taxAmount')(event.target.value)}
        />
      </div>
    </div>
  );
}

/** A read-only "Price per sq ft" for the price and square feet as typed; nothing when either is unknown or unreadable. */
export function PricePerSqft({ price, sqft }) {
  const p = readNumber(price, HOME_NUMBER_RULES.price);
  const s = readNumber(sqft, HOME_NUMBER_RULES.sqft);
  if (p.error || s.error) return null;
  const per = pricePerSqft({ price: p.value, sqft: s.value });
  if (per === null) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 14 }}>
      <span className="ax-plain">Price per sq ft</span>
      <strong data-testid="price-per-sqft">{money(per)}</strong>
    </div>
  );
}
