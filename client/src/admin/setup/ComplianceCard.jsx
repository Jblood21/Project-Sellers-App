import { useState } from 'react';

import {
  COMPLIANCE_DEFAULTS, LENDER_LOGOS, LONG_SETTING_KEYS, complianceOf, settingMaxLength,
} from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { TextAreaField, TextField } from '../ui.jsx';
import ImageSlot from './ImageSlot.jsx';
import { logoToDataUrl } from './readImage.js';

/** Which field to jump to for each thing complianceOf says is still missing. */
const MISSING_FIELD = {
  'lender name': 'lenderName',
  'lender NMLS ID': 'lenderNmls',
  // The key is the wording complianceOf uses, which spells it the British way.
  'state licence number': 'lenderLicense',
  'loan officer NMLS ID': 'loNmls',
  'Equal Housing statement': 'complianceEhl',
  'not an offer for credit statement': 'complianceNotOffer',
  'not a real estate agent statement': 'complianceNotAgent',
  'privacy policy link': 'compliancePrivacyUrl',
  'terms of use link': 'complianceTermsUrl',
  'accessibility link': 'complianceAccessibilityUrl',
};

/**
 * Every setting the footer is built from, in the order a buyer meets them. Long
 * ones are paragraphs and get a textarea with a live counter; short ones get a
 * line and a stated maximum, because the server will cut anything over it.
 */
const GROUPS = [
  {
    id: 'lender',
    title: 'Lender',
    restore: 'Restore Summit defaults',
    fields: [
      { key: 'lenderName', label: 'Lender name' },
      { key: 'lenderNmls', label: 'Company NMLS ID', inputMode: 'numeric' },
      { key: 'lenderAddress', label: 'Address' },
      { key: 'lenderPhone', label: 'Phone', inputMode: 'tel' },
      { key: 'lenderWebsite', label: 'Website', inputMode: 'url', placeholder: 'https://…' },
      { key: 'lenderTagline', label: 'Tagline', hint: 'Shown on the lender card inside the buyer app.' },
      {
        key: 'lenderLicense', label: 'State licensing statement', rows: 3,
        hint: 'The whole sentence, including the state license number once you have it. A number is what lets a buyer check it.',
      },
      {
        key: 'lenderNmlsUrl', label: 'NMLS Consumer Access link', inputMode: 'url',
        hint: 'Leave blank to build it from the NMLS ID.',
      },
      {
        key: 'loanApplicationUrl', label: 'Loan application link', inputMode: 'url', placeholder: 'https://…', keep: true,
        hint: 'Where “Start my loan process” goes: the lender’s online application. Blank hides those links. Restore defaults never changes it.',
      },
    ],
  },
  {
    id: 'lo',
    title: 'Loan officer',
    restore: 'Restore Summit defaults',
    fields: [
      { key: 'loName', label: 'Loan officer name' },
      {
        key: 'loNmls', label: 'Loan officer NMLS ID', inputMode: 'numeric',
        hint: 'The name is only shown together with this ID. Clear both to show the company alone.',
      },
    ],
  },
  {
    id: 'statements',
    title: 'Statements printed in the footer',
    restore: 'Restore Summit defaults',
    note: true,
    fields: [
      { key: 'complianceEhl', label: 'Equal Housing Lender statement', rows: 6 },
      { key: 'complianceNotOffer', label: 'Not an offer for credit', rows: 3 },
      { key: 'complianceNotAgent', label: 'Not a real estate agent', rows: 3 },
      { key: 'complianceDisclaimer', label: 'General disclaimer', rows: 5 },
      { key: 'complianceRates', label: 'Interest rate and APR note', rows: 3 },
      {
        key: 'complianceAba', label: 'Affiliated business disclosure', rows: 3,
        hint: 'Blank unless the builder and the lender are affiliated. Your compliance team decides whether you need one.',
      },
    ],
  },
  {
    id: 'links',
    title: 'Footer links',
    restore: 'Restore defaults',
    fields: [
      { key: 'compliancePrivacyUrl', label: 'Privacy Policy link', inputMode: 'url', placeholder: 'https://…' },
      { key: 'complianceTermsUrl', label: 'Terms of Use link', inputMode: 'url', placeholder: 'https://…' },
      { key: 'complianceAccessibilityUrl', label: 'Accessibility link', inputMode: 'url', placeholder: 'https://…' },
    ],
    help: 'A blank link is left out of the footer rather than guessed at. These live on the lender’s own website.',
  },
];

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// The rest of this page, like the product, uses the American spelling.
const shownAs = (label) => capital(label.replace('licence', 'license'));
const grouped = (n) => n.toLocaleString('en-US');

/**
 * Lender and compliance copy. Unlike the cards that save at once, these fields
 * are edited as a set and go live together, so they share the page's Save
 * settings button and its dirty tracking; the checklist and the preview are
 * computed from what is on the form now, so a fix shows up before it is saved.
 */
export default function ComplianceCard({ community, settings, setSettings, reload }) {
  const { token } = useAdmin();
  const [restored, setRestored] = useState('');

  const saved = community.settings;
  const result = complianceOf(settings, { community });
  const unsaved = Object.keys(COMPLIANCE_DEFAULTS).some((key) => (settings[key] ?? '') !== (saved[key] ?? ''));

  const jumpTo = (label) => {
    const field = document.getElementById(`setting-${MISSING_FIELD[label]}`);
    field?.scrollIntoView({ block: 'center' });
    field?.focus({ preventScroll: true });
  };

  const restore = (group) => {
    // A field marked `keep` is this community's own (not a Summit default), so it is left as typed.
    const patch = Object.fromEntries(group.fields.filter(({ keep }) => !keep).map(({ key }) => [key, COMPLIANCE_DEFAULTS[key]]));
    setSettings((prev) => ({ ...prev, ...patch }));
    setRestored(group.id);
  };

  const renderField = ({ key, label, hint, rows, keep, ...rest }) => {
    const max = settingMaxLength(key);
    const value = settings[key] ?? '';
    const change = (next) => setSettings((prev) => ({ ...prev, [key]: next }));
    // Paragraphs take the full width; short fields pair up once there is room.
    if (rows || LONG_SETTING_KEYS.includes(key)) {
      return (
        <div key={key} style={{ gridColumn: '1 / -1' }}>
          <TextAreaField
            id={`setting-${key}`} label={label} hint={hint} rows={rows ?? 3}
            value={value} maxLength={max} onChange={change}
            counter={`${grouped(value.length)} of ${grouped(max)} characters`}
          />
        </div>
      );
    }
    return (
      <div key={key}>
        <TextField
          id={`setting-${key}`} label={label} value={value} maxLength={max} onChange={change}
          hint={`${hint ? `${hint} ` : ''}Up to ${grouped(max)} characters.`}
          {...rest}
        />
      </div>
    );
  };

  // Built by the same rules as the buyer footer: the address, phone and website
  // share a line, and the NMLS link is inside the licence sentence, not repeated
  // among the links.
  const identity = [result.lender.address, result.lender.phone, result.lender.websiteHref ? result.lender.website : '']
    .filter(Boolean).join(' · ');
  const links = result.links.filter((link) => link.key !== 'nmls');

  const defaultName = COMPLIANCE_DEFAULTS.lenderName;
  const logoNote = (settings.lenderName ?? '').trim() === defaultName
    ? `Using the supplied ${defaultName} logo.`
    : `Using the supplied ${defaultName} logo, which is not this lender's. Upload theirs.`;

  const uploadLogo = async (dataUrl) => {
    await adminApi.addCommunityPhoto(token, community.id, 'lenderlogo', { dataUrl });
    await reload();
  };
  const removeLogo = async () => {
    await adminApi.deletePhoto(token, community.lenderLogo.id);
    await reload();
  };

  return (
    <div className="card elev-sm" style={{ gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="card-kicker">Lender &amp; compliance</span>
        {unsaved ? <span className="tag tag-accent">Unsaved changes</span> : null}
      </div>

      <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        This is printed at the foot of every buyer page, on the printed plan and in the plan email. The
        wording starts from Summit Home Loans&apos; and has not been reviewed by counsel, so have your
        compliance team read it before launch. The small labels in the footer itself (Loan officer, Verify
        our licensing at NMLS Consumer Access, Privacy Policy, Terms of Use and Accessibility) are fixed
        and cannot be edited here. Nothing changes for buyers until you press{' '}
        <strong>Save settings</strong>.
      </p>

      {result.missing.length ? (
        <section className="ax-callout" aria-labelledby="ax-attention">
          <h5 id="ax-attention">Needs your attention before launch ({result.missing.length})</h5>
          <ul>
            {result.missing.map((label) => (
              <li key={label}>
                <button type="button" onClick={() => jumpTo(label)}>{shownAs(label)}</button>
              </li>
            ))}
          </ul>
          {unsaved ? <span style={{ fontSize: 12 }}>Based on the form as it is now, including unsaved edits.</span> : null}
        </section>
      ) : (
        <section className="ax-callout ax-callout--ok" aria-labelledby="ax-attention">
          <h5 id="ax-attention">Nothing is missing</h5>
          <span style={{ fontSize: 13 }}>Every license and link the footer expects is filled in.</span>
        </section>
      )}

      {GROUPS.map((group) => {
        const keys = group.fields.filter((f) => !f.keep).map((f) => f.key);
        const atDefaults = keys.every((key) => (settings[key] ?? '') === COMPLIANCE_DEFAULTS[key]);
        const groupUnsaved = keys.some((key) => (settings[key] ?? '') !== (saved[key] ?? ''));
        return (
          <section key={group.id} className="ax-group" aria-labelledby={`ax-g-${group.id}`}>
            <div className="ax-group-head">
              <h5 id={`ax-g-${group.id}`}>
                {group.title}{' '}
                {groupUnsaved ? <span className="tag tag-accent" style={{ marginLeft: 4 }}>Unsaved</span> : null}
              </h5>
              <button
                type="button" className="btn btn-ghost" disabled={atDefaults} onClick={() => restore(group)}
                aria-label={`${group.restore} for ${group.title.toLowerCase()}`}
                style={{ minHeight: 44, fontSize: 12.5 }}
              >
                {group.restore}
              </button>
            </div>
            {restored === group.id && atDefaults ? (
              <span className="ax-status" role="status">
                Put back on the form. Press Save settings to make it live.
              </span>
            ) : null}
            {group.note ? (
              <span className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                In any statement, {'{lender}'} becomes the lender&apos;s name, and {'{nmls}'}, {'{lo}'}, {'{loNmls}'},{' '}
                {'{community}'} and {'{builder}'} work the same way. A word in braces that is not one of these is
                printed exactly as typed, so a typo is visible rather than lost.
              </span>
            ) : null}
            {group.help ? <span className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{group.help}</span> : null}
            <div className="ax-cols">{group.fields.map(renderField)}</div>
            {group.id === 'lender' ? (
              <ImageSlot
                label="Lender logo"
                image={community.lenderLogo?.url ?? null}
                fallback={{ url: LENDER_LOGOS.color, note: logoNote }}
                alt={community.lenderLogo ? 'Lender logo as saved' : `${defaultName} logo (supplied default)`}
                read={logoToDataUrl}
                onPick={uploadLogo}
                onRemove={community.lenderLogo ? removeLogo : undefined}
                removeWarning="Remove your lender logo and go back to the supplied Summit Home Loans logo?"
                hint="Saves as soon as it uploads. Leave it alone to keep the supplied Summit logo. PNG, WebP, JPEG or GIF up to 3 MB, shown at least 30 pixels tall."
              />
            ) : null}
          </section>
        );
      })}

      <section className="ax-group" aria-labelledby="ax-preview">
        <h5 id="ax-preview" style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 14 }}>Footer text preview</h5>
        <div className="ax-preview">
          {result.lender.ready ? (
            <p>
              <strong>{result.lender.name}</strong> · NMLS #{result.lender.nmls}
              {identity ? <><br />{identity}</> : null}
              {result.lo ? <><br />Loan officer: {result.lo.name} · NMLS #{result.lo.nmls}</> : null}
            </p>
          ) : (
            <p><em>The lender name and NMLS ID are both needed before the lender is shown.</em></p>
          )}
          {result.license || result.nmlsHref ? (
            <p>
              {result.license}
              {result.license && result.nmlsHref ? ' ' : null}
              {result.nmlsHref ? 'Verify our licensing at NMLS Consumer Access.' : null}
            </p>
          ) : null}
          {result.statements.map((statement) => <p key={statement.key}>{statement.text}</p>)}
          {links.length ? <p>{links.map((link) => link.label).join(' · ')}</p> : null}
          <p>{result.copyright}</p>
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Text only. The buyer app adds the lender logo and the Equal Housing Lender mark.
        </span>
      </section>
    </div>
  );
}
