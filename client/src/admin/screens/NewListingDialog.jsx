import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { money } from '@shared/domain.js';
import { HOME_NUMBER_RULES, readNumber } from '@shared/numberInput.js';
import { adminApi } from '../../lib/api.js';
import { readJson, writeJson } from '../../lib/storage.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import ImageSlot from '../setup/ImageSlot.jsx';
import { readPortrait } from './Profile.jsx';
import CheckedField, { PROBLEM_RED } from '../setup/CheckedField.jsx';
import { Dialog, SaveNote, TextField, useSaving } from '../ui.jsx';

// The brokerage an agent used last, so the second listing does not ask again. Kept on this device only.
const BROKERAGE_KEY = 'psa:lastBrokerage';
// The agent's own details, kept the same way, so the next listing starts with them filled in.
const AGENT_KEY = 'psa:lastListingAgent';
const AGENT_FIELDS = ['agentName', 'agentPhone', 'agentEmail', 'license'];
const COUNT_FIELDS = ['beds', 'baths', 'sqft'];

const rememberedBrokerage = () => {
  const saved = readJson(BROKERAGE_KEY);
  return typeof saved === 'string' ? saved : '';
};

const rememberedAgent = () => {
  const saved = readJson(AGENT_KEY);
  if (!saved || typeof saved !== 'object') return {};
  return Object.fromEntries(AGENT_FIELDS.map((key) => [key, typeof saved[key] === 'string' ? saved[key] : '']));
};

/**
 * Make a listing: one home an agent is selling. The address, the price and the facts a visitor looks for, who it is
 * listed with and a first photo; the server makes the listing and its one home together. The photo can only go up
 * once the home exists, so a photo that fails never loses the listing: the agent lands on The home with the reason
 * and can add it there.
 *
 * Pressing Create again after a dropped signal asks the server for nothing twice: once the listing exists, a retry
 * only does the part that is left (the photo).
 */
export default function NewListingDialog({ onClose }) {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [form, setForm] = useState({ address: '', city: '', price: '', beds: '', baths: '', sqft: '', brokerage: rememberedBrokerage(), agentName: '', agentPhone: '', agentEmail: '', license: '', ...rememberedAgent() });
  const [photo, setPhoto] = useState(null);
  // The agent's own details come from their account (Your details), so the form starts filled in; their face is the
  // one on the account too, and a new one picked here is saved there, which is where each new listing reads it from.
  const [profile, setProfile] = useState(null);
  const touchedAtLoad = useRef({});
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState({});
  const saver = useSaving();
  useEffect(() => {
    let live = true;
    adminApi.myProfile(token).then((mine) => {
      if (!live) return;
      setProfile(mine);
      // Fills only what has not been typed in the meantime, and what this device remembered stays as the fallback.
      setForm((f) => ({
        ...f,
        agentName: touchedAtLoad.current.agentName ? f.agentName : (mine.name || f.agentName),
        agentPhone: touchedAtLoad.current.agentPhone ? f.agentPhone : (mine.phone || f.agentPhone),
        agentEmail: touchedAtLoad.current.agentEmail ? f.agentEmail : (mine.email || f.agentEmail),
        license: touchedAtLoad.current.license ? f.license : (mine.license || f.license),
        brokerage: touchedAtLoad.current.brokerage ? f.brokerage : (mine.brokerage || f.brokerage),
      }));
    }, () => {});
    return () => { live = false; };
  }, [token]);
  const created = useRef(null);
  const photoDone = useRef(false);

  // A box is judged once it has been typed in and left: tabbing past an empty one (or the pop-up giving focus away and
  // back as it opens) is not a mistake to scold.
  const touched = useRef({});
  const set = (key) => (value) => {
    touched.current[key] = true;
    touchedAtLoad.current[key] = true;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const leave = (key) => {
    if (touched.current[key]) setLeft((prev) => ({ ...prev, [key]: true }));
  };

  // Only an address and a real price are needed; beds, baths and square feet may be blank (buyers see nothing for them).
  const problems = {};
  if (!form.address.trim()) problems.address = 'Give the home an address.';
  if (form.agentEmail.trim() && !form.agentEmail.includes('@')) problems.agentEmail = 'That email address needs an @ in it.';
  for (const key of ['price', ...COUNT_FIELDS]) {
    const { error } = readNumber(form[key], HOME_NUMBER_RULES[key]);
    if (error) problems[key] = error;
  }
  const problemOf = (key) => (tried || left[key] ? problems[key] ?? '' : '');
  const priceRead = readNumber(form.price, HOME_NUMBER_RULES.price);
  // The first count that is wrong speaks for the row of three: three sentences side by side would not fit a phone.
  const countProblemKey = COUNT_FIELDS.find((key) => problemOf(key));

  const create = () => {
    setTried(true);
    const first = ['address', 'price', ...COUNT_FIELDS, 'agentEmail'].find((key) => problems[key]);
    if (first) {
      document.getElementById(`listing-${first}`)?.focus();
      return Promise.resolve(false);
    }
    return saver.run(async () => {
      if (!created.current) {
        const body = { address: form.address.trim(), city: form.city.trim(), brokerage: form.brokerage.trim() };
        for (const key of ['price', ...COUNT_FIELDS]) body[key] = readNumber(form[key], HOME_NUMBER_RULES[key]).value ?? '';
        for (const key of AGENT_FIELDS) body[key] = form[key].trim();
        created.current = await adminApi.createListing(token, body);
        writeJson(BROKERAGE_KEY, form.brokerage.trim());
        writeJson(AGENT_KEY, Object.fromEntries(AGENT_FIELDS.map((key) => [key, form[key].trim()])));
      }
      const listing = created.current;
      let notice = '';
      if (photo && !photoDone.current) {
        try {
          await adminApi.addHomePhoto(token, listing.homes[0].id, { dataUrl: photo });
          photoDone.current = true;
        } catch (photoError) {
          notice = `${listing.name} was created, but the photo did not upload: ${photoError.message} Add it here.`;
        }
      }
      onClose();
      // The home is where the first photos and the facts are; it points on to the open houses.
      navigate(`/admin/communities/${listing.id}/homes`, { state: notice ? { notice } : null });
    });
  };

  return (
    <Dialog
      title="New listing"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={create} aria-disabled={saver.saving || undefined}>
            {saver.saving ? 'Creating…' : created.current ? 'Finish' : 'Create listing'}
          </button>
        </>
      }
    >
      <CheckedField
        id="listing-address" label="Address" value={form.address} placeholder="e.g. 123 Maple Street"
        onChange={set('address')} onBlur={() => leave('address')} error={problemOf('address')} autoComplete="off"
      />
      <TextField
        label="City and state" value={form.city} onChange={set('city')} placeholder="e.g. Lehi, UT" autoComplete="off"
      />
      <CheckedField
        id="listing-price" label="Price" value={form.price} placeholder="e.g. 475000 or 475k"
        onChange={set('price')}
        // A plain text box rather than a number one: a phone's number pad has no k or m on it.
        onBlur={() => {
          leave('price');
          // Written out in full once they leave the box, so "475k" is seen to mean $475,000 before it is saved.
          if (!priceRead.error) setForm((f) => ({ ...f, price: money(priceRead.value) }));
        }}
        error={problemOf('price')}
        preview={!priceRead.error && form.price.trim() ? `Buyers will see ${money(priceRead.value)}` : ''}
        hint="In dollars. You can type 475000, 475,000, $475,000, 475k or 1.2m."
        autoComplete="off"
      />
      <div className="grid-3">
        <CheckedField
          id="listing-beds" label="Beds" value={form.beds} inputMode="numeric" invalid={Boolean(problemOf('beds'))}
          onChange={set('beds')} onBlur={() => leave('beds')}
        />
        <CheckedField
          id="listing-baths" label="Baths" value={form.baths} inputMode="decimal" invalid={Boolean(problemOf('baths'))}
          onChange={set('baths')} onBlur={() => leave('baths')}
        />
        <CheckedField
          id="listing-sqft" label="Sq ft" value={form.sqft} inputMode="numeric" invalid={Boolean(problemOf('sqft'))}
          onChange={set('sqft')} onBlur={() => leave('sqft')}
        />
      </div>
      {countProblemKey ? (
        <span role="alert" style={{ color: PROBLEM_RED, fontSize: 14, lineHeight: 1.4 }}>{problems[countProblemKey]}</span>
      ) : (
        <span className="field-hint">Beds, baths and sq ft are optional. Leave one blank if you do not know it: visitors see nothing for it.</span>
      )}
      <TextField
        label="Brokerage" value={form.brokerage} onChange={set('brokerage')} placeholder="e.g. Summit Realty"
        hint="Printed with the listing. Remembered for your next one." autoComplete="organization"
      />
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <legend className="card-kicker" style={{ padding: 0, marginBottom: 8 }}>You, the listing agent</legend>
        <TextField
          label="Your name" value={form.agentName} onChange={set('agentName')} placeholder="e.g. Maren Whitcombe"
          autoComplete="name"
        />
        <TextField
          label="Your phone" value={form.agentPhone} onChange={set('agentPhone')} inputMode="tel" placeholder="e.g. 801-555-0111"
          hint="Buyers call or text this number to ask for a showing." autoComplete="tel"
        />
        <CheckedField
          id="listing-agentEmail" label="Your email" value={form.agentEmail} inputMode="email"
          onChange={set('agentEmail')} onBlur={() => leave('agentEmail')} error={problemOf('agentEmail')} autoComplete="email"
        />
        <TextField
          label="License number or line" value={form.license} onChange={set('license')} placeholder="e.g. Lic. #12345"
          hint="Printed under the home. Optional. Remembered for your next listing." autoComplete="off"
        />
      </fieldset>
      <ImageSlot
        label="Your photo (your face)" shape="square" image={profile?.photo ?? null} alt="Your photo as saved"
        hint="Visitors see you above the home's pictures. A clear head-and-shoulders photo works best. It is saved to your details, so your next listing has it too."
        read={readPortrait} use="portrait"
        onPick={async (dataUrl) => setProfile(await adminApi.saveMyProfile(token, { photo: dataUrl }))}
        onRemove={async () => setProfile(await adminApi.saveMyProfile(token, { photo: null }))}
        removeWarning="Remove your photo from your details?"
      />
      <PhotoPicker
        label="First photo of the home"
        hint="Tap to upload — visitors see this first when they scan the sign"
        pendingDataUrl={photo}
        onPick={setPhoto}
      />
      <SaveNote saver={saver} />
    </Dialog>
  );
}
