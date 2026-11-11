import { useState } from 'react';

import { DEFAULT_SETTINGS, complianceOf, fillTokens, incentiveWritten, settingMaxLength } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, TextAreaField, TextField, Toggle } from '../ui.jsx';

const KEYS = ['incentiveTitle', 'incentiveBody', 'incentiveFinePrint', 'incentiveButton', 'incentivePhone', 'incentiveEmail', 'incentiveMessage'];
const grouped = (n) => n.toLocaleString('en-US');

/**
 * The builder incentive: a card above Explore Homes on the buyer's home screen,
 * with a "Find out if you qualify" button that opens a message to the team.
 *
 * The switch saves the moment it is flipped, like the logo and layout cards; the
 * words go live together with the rest of the page's Save settings button, so
 * a half-written headline never reaches a buyer.
 *
 * Switching it on shows buyers nothing until a headline and the details have been written
 * and saved: nothing is filled in for them, and the card says so while that is true.
 */
export default function IncentiveCard({ community, settings, setSettings, reload }) {
  const { token } = useAdmin();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const on = Boolean(community.features?.incentive);
  const saved = community.settings;
  // What buyers get is decided by what is SAVED, so this line follows the saved words, not the ones being typed.
  const empty = on && !incentiveWritten(saved);
  const unsaved = KEYS.some((key) => (settings[key] ?? '') !== (saved[key] ?? ''));

  const flip = async (next) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { incentive: next } });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, extra = {}) => {
    const max = settingMaxLength(key);
    const value = settings[key] ?? '';
    const change = (next) => setSettings((prev) => ({ ...prev, [key]: next }));
    if (extra.rows) {
      return (
        <div key={key} style={{ gridColumn: '1 / -1' }}>
          <TextAreaField
            id={`setting-${key}`} label={label} rows={extra.rows}
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
          inputMode={extra.inputMode} placeholder={extra.placeholder}
        />
      </div>
    );
  };

  // The card as a buyer will see it, with {community} and friends filled in.
  const tokens = {
    community: community.name, builder: community.builder ?? '',
    lender: complianceOf(settings, { community }).lender.name || 'the lender',
  };
  const fill = (value) => fillTokens(value, tokens).trim();
  const message = fill(settings.incentiveMessage || DEFAULT_SETTINGS.incentiveMessage);

  return (
    <div className="card elev-sm" style={{ gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="card-kicker">Builder incentive</span>
        {unsaved ? <span className="tag tag-accent">Unsaved changes</span> : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle on={on} onChange={flip} label="Show the builder incentive to buyers" />
        <span style={{ fontSize: 14 }}>
          <strong>{on ? (empty ? 'Switched on, not showing yet' : 'Shown above Explore Homes') : 'Not shown'}</strong>
          {busy ? <span className="text-muted"> · saving…</span> : null}
        </span>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {empty ? (
        <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
          <span><strong>Not showing to buyers yet:</strong> write a headline and details below, then press Save settings.</span>
        </p>
      ) : null}

      <div className="ax-cols">
        {field('incentiveTitle', 'Headline')}
        {field('incentiveButton', 'Button label')}
        {field('incentiveBody', 'Details', { rows: 3 })}
        {field('incentiveFinePrint', 'Terms (fine print)', { rows: 3 })}
        {field('incentivePhone', 'Phone to call or text', { inputMode: 'tel' })}
        {field('incentiveEmail', 'Email', {
          inputMode: 'email', placeholder: 'team@yourcompany.com',
        })}
        {field('incentiveMessage', 'Message the buyer sends', { rows: 2 })}
      </div>

      <section className="ax-group" aria-labelledby="ax-inc-preview">
        <h5 id="ax-inc-preview" style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 14 }}>Preview</h5>
        <div className="ax-preview">
          <p><strong>{fill(settings.incentiveTitle) || '(no headline)'}</strong></p>
          {fill(settings.incentiveBody) ? <p>{fill(settings.incentiveBody)}</p> : null}
          {fill(settings.incentiveFinePrint) ? <p><small>{fill(settings.incentiveFinePrint)}</small></p> : null}
          <p>[{fill(settings.incentiveButton) || DEFAULT_SETTINGS.incentiveButton}] → “{message}”</p>
        </div>
      </section>
    </div>
  );
}
