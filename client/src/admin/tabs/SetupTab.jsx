import { useEffect, useRef, useState } from 'react';

import { THEMES, THEME_CHIPS, num } from '@shared/domain.js';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { dateTime } from '../../lib/format.js';
import { fileToDataUrl } from '../../lib/photos.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, Field, TextField } from '../ui.jsx';

/** Every value on this tab flows straight into the buyer tools. */
export default function SetupTab({ community, reload }) {
  const { token } = useAdmin();
  const [settings, setSettings] = useState(community.settings);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => setSettings(community.settings), [community.settings]);

  const dirty = JSON.stringify(settings) !== JSON.stringify(community.settings);
  const set = (key) => (value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { settings });
      await reload();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setTheme = async (theme) => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { theme });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const checkRates = async () => {
    setError('');
    try {
      const result = await adminApi.checkRates(token, community.id);
      setSettings(result.settings);
      await reload();
      if (!result.webhookConfigured) {
        setError('No rate inbox connected yet — set RATES_WEBHOOK_SECRET and point Zapier at /api/communities/' +
          community.id + '/rates. Rates above can be edited by hand meanwhile.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">Buyer app theme</span>
        <div className="grid-3">
          {Object.entries(THEMES).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              aria-pressed={community.theme === key}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px',
                borderRadius: 12, cursor: 'pointer', background: 'transparent',
                border: `2px solid ${community.theme === key ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              }}
            >
              <span
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${THEME_CHIPS[key][0]} 50%, ${THEME_CHIPS[key][1]} 50%)`,
                  border: '1px solid var(--color-divider)',
                }}
              />
              <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'center' }}>{label}</span>
            </button>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Changes the buyer app instantly — functionality stays identical.
        </span>
      </div>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="card-kicker">Live rates</span>
          <button type="button" className="btn btn-ghost" onClick={checkRates} style={{ minHeight: 34, fontSize: 12.5 }}>
            Check rate inbox
          </button>
        </div>
        <div className="grid-3">
          <TextField label="Conv %" value={settings.rateConv} onChange={set('rateConv')} inputMode="decimal" />
          <TextField label="FHA %" value={settings.rateFha} onChange={set('rateFha')} inputMode="decimal" />
          <TextField label="VA %" value={settings.rateVa} onChange={set('rateVa')} inputMode="decimal" />
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Updated {settings.ratesUpdatedAt ? dateTime(settings.ratesUpdatedAt) : 'never'} · a Zapier email parser can
          post new rates to this community automatically.
        </span>
      </div>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">Monthly cost assumptions</span>
        <div className="grid-3">
          <TextField label="Tax %/yr" value={settings.taxPctYr} onChange={set('taxPctYr')} inputMode="decimal" />
          <TextField label="Insurance $/yr" value={settings.insuranceYr} onChange={set('insuranceYr')} inputMode="numeric" />
          <TextField label="HOA $/mo" value={settings.hoaMo} onChange={set('hoaMo')} inputMode="numeric" />
        </div>
      </div>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">Down payment assistance rules</span>
        <div className="grid-3">
          <TextField label="Income limit $" value={settings.dpaIncomeLimit} onChange={set('dpaIncomeLimit')} inputMode="numeric" />
          <TextField label="Assist amount $" value={settings.dpaAmount} onChange={set('dpaAmount')} inputMode="numeric" />
          <TextField label="Min credit" value={settings.dpaMinCredit} onChange={set('dpaMinCredit')} inputMode="numeric" />
        </div>
      </div>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">Call request alerts</span>
        <TextField
          label="Send call requests to"
          value={settings.notifyEmail}
          onChange={set('notifyEmail')}
          inputMode="email"
          placeholder="sales@yourcompany.com"
        />
        <span className="text-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
          Leave blank to use the account you sign in with. A buyer asking for a call is
          time-sensitive, so this is the one thing the app will email you about.
        </span>
      </div>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">Credit range cutoffs</span>
        <div className="grid-3">
          <TextField label="Excellent ≥" value={settings.creditExcellentMin} onChange={set('creditExcellentMin')} inputMode="numeric" />
          <TextField label="Good ≥" value={settings.creditGoodMin} onChange={set('creditGoodMin')} inputMode="numeric" />
          <TextField label="Fair ≥" value={settings.creditFairMin} onChange={set('creditFairMin')} inputMode="numeric" />
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Buyers see these as ranges, e.g. &ldquo;Good {settings.creditGoodMin}–{num(settings.creditExcellentMin) - 1}&rdquo;.
        </span>
      </div>

      <CommunityArtwork community={community} reload={reload} />

      <ErrorNote>{error}</ErrorNote>
      <button
        type="button" className="btn btn-primary btn-block" onClick={saveSettings}
        disabled={!dirty || saving} style={{ minHeight: 46 }}
      >
        {saving ? 'Saving…' : dirty ? 'Save settings' : savedAt ? 'Saved ✓' : 'Saved'}
      </button>
    </div>
  );
}

function CommunityArtwork({ community, reload }) {
  const { token } = useAdmin();
  const heroInput = useRef(null);
  const iconInput = useRef(null);
  const mapInput = useRef(null);
  const [error, setError] = useState('');

  const upload = (kind) => async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      await adminApi.addCommunityPhoto(token, community.id, kind, { dataUrl });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const slot = (kind, label, hint, inputRef, photo, height) => (
    <Field label={label}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', height, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
          border: '1.5px dashed var(--color-neutral-400)', background: 'transparent', padding: 0,
        }}
      >
        {photo ? <Photo photo={photo} alt={label} /> : <span className="text-muted" style={{ fontSize: 12.5 }}>{hint}</span>}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload(kind)} />
    </Field>
  );

  return (
    <div className="card elev-sm" style={{ gap: 12 }}>
      <span className="card-kicker">Community artwork</span>
      {slot('hero', 'Hero photo (QR landing)', 'Tap to upload the community photo', heroInput, community.heroPhoto, 140)}
      {slot('icon', 'App icon (Add to Home Screen)', 'Tap to upload a square icon', iconInput, community.iconPhoto, 90)}
      {slot('sitemap', 'Site map (the plat buyers tap)', 'Tap to upload the community site map', mapInput, community.siteMap, 140)}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
