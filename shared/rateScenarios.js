/**
 * Sample loan scenarios a lender (or the agent who works with one) shows next to a home or community: three of five
 * loan solutions, each with a rate (shown bold) and an APR (shown in italics), an effective date, and a line that
 * says whose situation the figures are based on.
 *
 * Kept in the settings like every other figure on Setup, so a scenario is the same for communities and listings.
 * Nothing here imports from domain.js (domain.js imports this, to fold the starting values into DEFAULT_SETTINGS).
 */

export const RATE_SCENARIOS = [
  { k: 'fha35', label: 'FHA, 3.5% down', downPct: 3.5 },
  { k: 'conv3', label: 'Conventional, 3% down', downPct: 3 },
  { k: 'conv5', label: 'Conventional, 5% down', downPct: 5 },
  { k: 'conv20', label: 'Conventional, 20% down', downPct: 20 },
  { k: 'dpa100', label: '100% financing with down payment assistance', downPct: 0, note: 'where available' },
];
export const SCENARIO_KEYS = RATE_SCENARIOS.map((s) => s.k);
export const MAX_SCENARIOS = 3;
export const SCENARIO_ASSUMPTIONS_MAX = 300;
export const DEFAULT_SCENARIO_ASSUMPTIONS =
  'These scenarios are based on a first-time homebuyer with a 780+ median credit score using a conventional HomeReady program.';

export const scenarioRateKey = (k) => `scRate_${k}`;
export const scenarioAprKey = (k) => `scApr_${k}`;

/** The settings these add, and their starting values (folded into DEFAULT_SETTINGS): nothing shows until it is filled in. */
export const SCENARIO_DEFAULTS = {
  scenarioPicks: '',
  scenarioEffective: '',
  scenarioAssumptions: DEFAULT_SCENARIO_ASSUMPTIONS,
  ...Object.fromEntries(RATE_SCENARIOS.flatMap((s) => [[scenarioRateKey(s.k), ''], [scenarioAprKey(s.k), '']])),
};

/** The picks as a list of known keys, each once, in the order given. Never throws. */
export function picksOf(text) {
  const seen = new Set();
  for (const part of String(text ?? '').split(',')) {
    const k = part.trim();
    if (SCENARIO_KEYS.includes(k)) seen.add(k);
  }
  return [...seen];
}

/** Checks what the admin sent for the picks: { value } (the text to store) or { error } in words. */
export function cleanPicks(text) {
  const parts = String(text ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => !SCENARIO_KEYS.includes(p))) return { error: 'Pick from the five loan solutions listed.' };
  const picks = picksOf(text);
  if (picks.length > MAX_SCENARIOS) return { error: `Pick up to ${MAX_SCENARIOS} loan solutions to show.` };
  return { value: picks.join(',') };
}

/** A literal 'YYYY-MM-DD' (no timezone in the way), or ''. */
export function validEffectiveDate(text) {
  const t = String(text ?? '').trim();
  if (!t) return { value: '' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return { error: 'The effective date must be a date.' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return { error: 'The effective date must be a real date.' };
  return { value: t };
}

const rateText = (raw) => {
  const n = Number(String(raw ?? '').replace(/[%\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * What a buyer is shown: the picked solutions that have a rate (a pick with no rate typed is left out, never shown
 * empty), the date, and the assumptions line. `rows` is empty when there is nothing to show.
 */
export function scenariosOf(settings) {
  const rows = picksOf(settings?.scenarioPicks)
    .map((k) => {
      const meta = RATE_SCENARIOS.find((s) => s.k === k);
      return { k, label: meta.label, note: meta.note ?? '', downPct: meta.downPct, rate: rateText(settings?.[scenarioRateKey(k)]), apr: rateText(settings?.[scenarioAprKey(k)]) };
    })
    .filter((row) => row.rate !== null)
    .slice(0, MAX_SCENARIOS);
  return {
    rows,
    effective: validEffectiveDate(settings?.scenarioEffective).value ?? '',
    assumptions: String(settings?.scenarioAssumptions ?? '').trim(),
  };
}

/** "6.250%": how a rate or APR is written. */
export const percentLabel = (value) => `${Number(value).toFixed(3)}%`;
