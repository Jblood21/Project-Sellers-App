import { useEffect, useRef, useState } from 'react';

import { LISTING_DEFAULTS, LISTING_STATUSES, settingMaxLength } from '@shared/domain.js';
import { useAdmin } from '../AdminContext.jsx';
import { renameListing } from '../listing.js';
import { Field, SaveNote, TextAreaField, TextField, useSaving } from '../ui.jsx';

const STANDARD = LISTING_DEFAULTS.listingDisclosure;

const baseOf = (community) => ({
  status: LISTING_STATUSES.includes(community.status) ? community.status : LISTING_STATUSES[1],
  mlsNumber: community.settings?.mlsNumber ?? '',
  agentLicense: community.settings?.agentLicense ?? '',
  brokerage: community.builder ?? '',
  address: community.name ?? '',
  city: community.location ?? '',
  disclosure: community.settings?.listingDisclosure ?? '',
});

/**
 * What the listing is: where it stands, its address and city (the address is the home's name too, so both change
 * together), who it is listed with, the MLS number, the agent's license line and the disclosure printed in the
 * footer. Saved with its own button, on its own: none of this goes through Save settings, so a status change is
 * never held up by a half-typed rate on the same page.
 */
export default function ListingDetailsCard({ community, reload, onDirty }) {
  const { token } = useAdmin();
  const saver = useSaving();
  const base = baseOf(community);
  const [form, setForm] = useState(base);
  const [error, setError] = useState('');
  const baseKey = JSON.stringify(base);
  const lastBase = useRef(baseKey);
  const dirty = JSON.stringify(form) !== baseKey;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const max = settingMaxLength('listingDisclosure');

  // Saved elsewhere (a reload after another card, a second device): only the boxes not touched here take the new value.
  useEffect(() => {
    const before = JSON.parse(lastBase.current);
    const after = JSON.parse(baseKey);
    lastBase.current = baseKey;
    setForm((prev) => Object.fromEntries(Object.keys(after).map((key) => [key, prev[key] === before[key] ? after[key] : prev[key]])));
  }, [baseKey]);

  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  const save = () => {
    setError('');
    if (!form.address.trim()) {
      setError('Give the home an address.');
      document.getElementById('listing-details-address')?.focus();
      return Promise.resolve(false);
    }
    return saver.run(async () => {
      await renameListing(token, community, form.address.trim(), {
        location: form.city.trim(),
        builder: form.brokerage.trim(),
        status: form.status,
        settings: { mlsNumber: form.mlsNumber, agentLicense: form.agentLicense, listingDisclosure: form.disclosure },
      });
      const fresh = await reload({ leads: false });
      // What the server kept (it trims and caps), so "Saved" is true and the unsaved mark clears.
      if (fresh) setForm(baseOf(fresh));
    });
  };

  return (
    <div className="card elev-sm" id="listing-details" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="card-kicker">Listing details</span>
        {dirty ? <span className="tag tag-accent">Unsaved changes</span> : null}
      </div>
      <div className="ax-cols">
        <Field label="Status" hint="Shown on the home's page and on your Today page.">
          <select className="input" value={form.status} onChange={(event) => set('status')(event.target.value)}>
            {LISTING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </Field>
        <TextField
          label="MLS number" value={form.mlsNumber} onChange={set('mlsNumber')} maxLength={settingMaxLength('mlsNumber')}
          hint="Printed under the home. Leave it blank to print nothing." autoComplete="off"
        />
        <TextField
          id="listing-details-address" label="Address" value={form.address} onChange={set('address')} autoComplete="off"
          hint="Also the home's name, so the two always match."
        />
        <TextField label="City and state" value={form.city} onChange={set('city')} placeholder="e.g. Lehi, UT" autoComplete="off" />
        <TextField
          label="Brokerage" value={form.brokerage} onChange={set('brokerage')} autoComplete="organization"
          hint="The company the home is listed with. Printed in the footer."
        />
        <TextField
          label="Your license line" value={form.agentLicense} onChange={set('agentLicense')} maxLength={settingMaxLength('agentLicense')}
          hint="For example “Jane Smith, Lic. #12345”. Printed under the home and in the footer. Blank prints nothing." autoComplete="off"
        />
      </div>
      <TextAreaField
        id="listing-details-disclosure" label="Disclosure in the footer" rows={4} value={form.disclosure} maxLength={max}
        onChange={set('disclosure')}
        hint="Printed above the lender details at the foot of the page. Clearing it removes the line."
        counter={`${form.disclosure.length.toLocaleString('en-US')} of ${max.toLocaleString('en-US')} characters`}
      />
      <div>
        <button
          type="button" className="btn btn-ghost" disabled={form.disclosure === STANDARD}
          onClick={() => set('disclosure')(STANDARD)} style={{ minHeight: 44, fontSize: 14 }}
        >
          Use the standard text
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button" className="btn btn-primary" onClick={save} disabled={!dirty}
          aria-disabled={saver.saving || undefined} style={{ minHeight: 46 }}
        >
          {saver.saving ? 'Saving…' : dirty ? 'Save listing details' : 'Saved'}
        </button>
      </div>
      {error ? <p role="alert" style={{ color: '#a8332b', fontSize: 14, margin: 0 }}>{error}</p> : null}
      <SaveNote saver={saver} />
    </div>
  );
}
