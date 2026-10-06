/**
 * The lender block and the compliance copy that sits at the foot of every
 * buyer page.
 *
 * One module, one answer. The footer on screen, the footer on the printed plan,
 * the footer on the plan email and the lender in the structured data are all
 * built from `complianceOf`, so a disclosure that is edited, or removed, in
 * Setup changes everywhere at once and cannot drift between the places a buyer
 * might read it.
 *
 * Nothing here imports from domain.js: domain.js imports THIS, to fold the
 * defaults into DEFAULT_SETTINGS.
 *
 * ── WHERE THE WORDS COME FROM ────────────────────────────────────────────
 * `ehl`, `license`, `disclaimer` and the links are the wording in the supplied
 * Cornerpost ComplianceFooter. `notOffer` and `notAgent` are the two statements
 * asked for by name. `rates` is a conventional mortgage-advertising line and is
 * the one addition nobody supplied. None of it has been reviewed by counsel, and
 * every piece is editable per community in Setup so compliance can change it
 * without a deploy.
 *
 * Deliberately NOT included, because each depends on facts only the lender and
 * builder have:
 *   · a loan officer: the owners are business partners and one company ID covers
 *     the page, so no individual is named until a community chooses to
 *   · a RESPA Affiliated Business Arrangement disclosure (`aba`, blank; owed if
 *     the builder and lender are affiliated)
 *   · Truth in Lending "trigger term" disclosures beyond the APR line above
 *   · state-specific wording for any state other than Utah
 */

import { FAQ_JSON_MAX } from './faq.js';

/** What Setup can hold, with the defaults a new community starts from. */
export const COMPLIANCE_DEFAULTS = {
  // ── who the lender is ───────────────────────────────────────────────────
  lenderName: 'Summit Home Loans',
  lenderNmls: '1790749',
  lenderAddress: '375 N Main St, Suite 201, Kaysville, UT 84037',
  lenderPhone: '801-855-8535',
  lenderWebsite: '',
  lenderTagline: 'Financing for buyers at this community.',
  // A named loan officer, shown with their own NMLS ID. Blank by default: the
  // page identifies the company, and a community that wants an individual named
  // adds both fields in Setup.
  loName: '',
  loNmls: '',
  // The whole sentence, in the wording of the supplied footer, with the licence
  // number the owners gave. `missing` in complianceOf flags it if a community
  // edits the number out.
  lenderLicense: 'Licensed by the Utah Division of Real Estate, mortgage entity license #1337516.',
  // Blank derives the NMLS Consumer Access page from lenderNmls.
  lenderNmlsUrl: '',

  // ── the statements, in the order they are printed ───────────────────────
  complianceEhl:
    'Equal Housing Lender. We do business in accordance with the Federal Fair Housing Law and the '
    + 'Equal Credit Opportunity Act. The Equal Credit Opportunity Act prohibits creditors from '
    + 'discriminating against credit applicants on the basis of race, color, religion, national '
    + 'origin, sex, marital status or age (provided the applicant has the capacity to contract); '
    + 'because all or part of the applicant’s income derives from any public assistance program; '
    + 'or because the applicant has in good faith exercised any right under the Consumer Credit '
    + 'Protection Act.',
  complianceNotOffer:
    'The information provided on this site is for general educational and illustrative purposes '
    + 'only and is not an offer for credit.',
  complianceNotAgent:
    '{lender} is a mortgage lender. It is not a real estate agent or broker and does not provide '
    + 'real estate brokerage services or advice.',
  complianceDisclaimer:
    'Not a commitment to lend. All loans are subject to credit approval, underwriting and property '
    + 'eligibility. Rates, terms and programs change without notice. Payment and affordability '
    + 'figures on this site are estimates for illustration only, not a loan offer, pre-approval or '
    + 'Loan Estimate. Down payment assistance is subject to program eligibility and funding. You '
    + 'are free to choose any lender.',
  complianceRates:
    'Interest rates shown are examples and are not an annual percentage rate (APR). The APR may be '
    + 'higher than the interest rate.',
  // Blank on purpose: owed only when the builder and lender are affiliated.
  complianceAba: '',

  // ── the links under the statements ──────────────────────────────────────
  // Blank hides the link. They are not guessed at: a footer link that goes
  // nowhere is worse than no link, and these live on the lender's own site.
  compliancePrivacyUrl: '',
  complianceTermsUrl: '',
  complianceAccessibilityUrl: '',

  // ── where a buyer starts a loan ─────────────────────────────────────────
  // The lender's online application, as supplied by Summit Home Loans. Clearing
  // the field in Setup hides every "Start my loan process" link and the link in
  // the loan note: a link that goes nowhere is worse than none.
  loanApplicationUrl: 'https://summit.my1003app.com?time=1791312371101',
};

/** Keys whose values are paragraphs rather than a line, so they get a longer cap. */
export const LONG_SETTING_KEYS = [
  'complianceEhl', 'complianceNotOffer', 'complianceNotAgent', 'complianceDisclaimer',
  'complianceRates', 'complianceAba', 'lenderLicense',
  'incentiveBody', 'incentiveFinePrint',
];
export const SHORT_SETTING_MAX = 300;
export const LONG_SETTING_MAX = 4000;

/**
 * The longest a setting may be. Applied by the server before storing: these are
 * rendered on every page of the buyer app, so a pasted novel would be too.
 */
export function settingMaxLength(key) {
  if (key === 'faqJson') return FAQ_JSON_MAX;
  return LONG_SETTING_KEYS.includes(key) ? LONG_SETTING_MAX : SHORT_SETTING_MAX;
}

const text = (value) => String(value ?? '').trim();

/** Replaces {lender}, {nmls}, {lo}, {loNmls}, {community} and {builder}. */
export function fillTokens(template, values = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => {
    // An unknown token is left exactly as typed, so a typo in Setup is visible
    // on the page instead of being quietly deleted from a legal statement.
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match;
    return String(values[key] ?? '');
  });
}

/** The NMLS Consumer Access page for a company ID. */
export function nmlsConsumerUrl(nmls) {
  const id = text(nmls).replace(/\D/g, '');
  return id ? `https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/${id}` : '';
}

/** Only an http(s) address is ever rendered as a link. */
export function safeHref(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/**
 * A phone number a builder typed into Setup as a tel: link, or '' when it cannot
 * be dialled safely.
 *
 * Keeping every digit would turn "801-855-8535 ext. 2", or two numbers written
 * side by side, into a link that rings a different number from the one printed
 * beside it. So the dial string is cut at the first extension marker or slash and
 * only a complete number is accepted: ten digits, eleven starting with 1, or an
 * international number written with a leading plus. Anything else is shown as
 * plain text, which is honest, rather than as a link that quietly rings the wrong place.
 */
export function telHref(phone) {
  const main = text(phone).split(/\/|;|ext|x(?=\s*\d)|#/i)[0];
  const digits = main.replace(/\D/g, '');
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  if (/^\s*\+/.test(main) && digits.length >= 8 && digits.length <= 15) return `tel:+${digits}`;
  return '';
}

/**
 * Everything a footer needs, resolved from a community's settings.
 *
 *   lender      who they are; `ready` is false when the name or NMLS ID is blank
 *   lo          the named loan officer, or null
 *   license     the state licensing sentence
 *   statements  the paragraphs to print, in order, blanks dropped, tokens filled
 *   links       the links to print, in order, with no href dropped
 *   copyright   '© 2026 Summit Home Loans'
 *   missing     what a human still has to supply before this can go live
 *
 * `year` is passed in rather than read from the clock so the result is a pure
 * function of its inputs, which is what lets the server and the browser agree.
 */
export function complianceOf(settings = {}, { year, community = {} } = {}) {
  const s = { ...COMPLIANCE_DEFAULTS, ...(settings || {}) };

  const name = text(s.lenderName);
  const nmls = text(s.lenderNmls);
  const loName = text(s.loName);
  const loNmls = text(s.loNmls);

  const tokens = {
    lender: name || 'the lender',
    nmls,
    lo: loName,
    loNmls,
    community: text(community.name),
    builder: text(community.builder),
  };
  const fill = (value) => text(fillTokens(value, tokens));

  const lender = {
    name,
    nmls,
    address: text(s.lenderAddress),
    phone: text(s.lenderPhone),
    phoneHref: telHref(s.lenderPhone),
    website: text(s.lenderWebsite),
    websiteHref: safeHref(s.lenderWebsite),
    // Where "Start my loan process" goes; '' hides the link.
    applyHref: safeHref(s.loanApplicationUrl),
    tagline: text(s.lenderTagline),
    ready: Boolean(name && nmls),
  };

  // A named LO is only shown with their own ID: a name with no NMLS number next
  // to it is an incomplete advertisement of an individual loan originator.
  const lo = loName && loNmls ? { name: loName, nmls: loNmls } : null;

  const statements = [
    ['ehl', s.complianceEhl],
    ['notOffer', s.complianceNotOffer],
    ['notAgent', s.complianceNotAgent],
    ['disclaimer', s.complianceDisclaimer],
    ['rates', s.complianceRates],
    ['aba', s.complianceAba],
  ]
    .map(([key, value]) => ({ key, text: fill(value) }))
    .filter((item) => item.text);

  const nmlsHref = safeHref(s.lenderNmlsUrl) || nmlsConsumerUrl(nmls);
  const links = [
    { key: 'nmls', label: 'NMLS Consumer Access', href: nmlsHref },
    { key: 'privacy', label: 'Privacy Policy', href: safeHref(s.compliancePrivacyUrl) },
    { key: 'terms', label: 'Terms of Use', href: safeHref(s.complianceTermsUrl) },
    { key: 'accessibility', label: 'Accessibility', href: safeHref(s.complianceAccessibilityUrl) },
  ].filter((link) => link.href);

  const license = fill(s.lenderLicense);

  const missing = [];
  if (!name) missing.push('lender name');
  if (!nmls) missing.push('lender NMLS ID');
  // A state licence number is a number, and the sentence either has digits in it
  // or it does not. This is the check that stops "Licensed by the Utah Division
  // of Real Estate." going live without the thing that makes it checkable.
  if (!/\d/.test(license)) missing.push('state licence number');
  if (loName && !loNmls) missing.push('loan officer NMLS ID');
  // The three statements the request names. Clearing one and saving would
  // otherwise publish a page with the disclosure silently gone, so a blank one is
  // flagged the way a blank licence number is (the others are the builder's to
  // keep or drop). `statements` is already filtered of blanks, so test the source.
  if (!fill(s.complianceEhl)) missing.push('Equal Housing statement');
  if (!fill(s.complianceNotOffer)) missing.push('not an offer for credit statement');
  if (!fill(s.complianceNotAgent)) missing.push('not a real estate agent statement');
  if (!text(s.compliancePrivacyUrl)) missing.push('privacy policy link');
  if (!text(s.complianceTermsUrl)) missing.push('terms of use link');
  if (!text(s.complianceAccessibilityUrl)) missing.push('accessibility link');

  return {
    lender,
    lo,
    license,
    statements,
    links,
    nmlsHref,
    copyright: `© ${year ?? new Date().getFullYear()} ${name || text(community.name)}`.trim(),
    missing,
  };
}

/**
 * The same footer as plain text, for the plan email and anywhere else markup is
 * not available. Built from complianceOf so it can never say something the page
 * does not.
 */
export function complianceText(settings, options = {}) {
  const c = complianceOf(settings, options);
  const lines = [];
  if (c.lender.name) {
    lines.push(
      `${c.lender.name}${c.lender.nmls ? ` · NMLS #${c.lender.nmls}` : ''}`,
      [c.lender.address, c.lender.phone].filter(Boolean).join(' · '),
    );
  }
  if (c.lo) lines.push(`Loan officer: ${c.lo.name} · NMLS #${c.lo.nmls}`);
  if (c.license) lines.push('', c.license);
  if (c.nmlsHref) lines.push(`Verify our licensing: ${c.nmlsHref}`);
  for (const statement of c.statements) lines.push('', statement.text);
  lines.push('', c.copyright);
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n').trim();
}
