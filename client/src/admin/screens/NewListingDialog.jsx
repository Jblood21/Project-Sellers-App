import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { money } from '@shared/domain.js';
import { HOME_NUMBER_RULES, readNumber } from '@shared/numberInput.js';
import { adminApi } from '../../lib/api.js';
import { readJson, writeJson } from '../../lib/storage.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import CheckedField, { PROBLEM_RED } from '../setup/CheckedField.jsx';
import { Dialog, SaveNote, TextField, useSaving } from '../ui.jsx';

// The brokerage an agent used last, so the second listing does not ask again. Kept on this device only.
const BROKERAGE_KEY = 'psa:lastBrokerage';
const COUNT_FIELDS = ['beds', 'baths', 'sqft'];

const rememberedBrokerage = () => {
  const saved = readJson(BROKERAGE_KEY);
  return typeof saved === 'string' ? saved : '';
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
  const [form, setForm] = useState({ address: '', city: '', price: '', beds: '', baths: '', sqft: '', brokerage: rememberedBrokerage() });
  const [photo, setPhoto] = useState(null);
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState({});
  const saver = useSaving();
  const created = useRef(null);
  const photoDone = useRef(false);

  // A box is judged once it has been typed in and left: tabbing past an empty one (or the pop-up giving focus away and
  // back as it opens) is not a mistake to scold.
  const touched = useRef({});
  const set = (key) => (value) => {
    touched.current[key] = true;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const leave = (key) => {
    if (touched.current[key]) setLeft((prev) => ({ ...prev, [key]: true }));
  };

  // Only an address and a real price are needed; beds, baths and square feet may be blank (buyers see nothing for them).
  const problems = {};
  if (!form.address.trim()) problems.address = 'Give the home an address.';
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
    const first = ['address', 'price', ...COUNT_FIELDS].find((key) => problems[key]);
    if (first) {
      document.getElementById(`listing-${first}`)?.focus();
      return Promise.resolve(false);
    }
    return saver.run(async () => {
      if (!created.current) {
        const body = { address: form.address.trim(), city: form.city.trim(), brokerage: form.brokerage.trim() };
        for (const key of ['price', ...COUNT_FIELDS]) body[key] = readNumber(form[key], HOME_NUMBER_RULES[key]).value ?? '';
        created.current = await adminApi.createListing(token, body);
        writeJson(BROKERAGE_KEY, form.brokerage.trim());
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
      <PhotoPicker
        label="First photo"
        hint="Tap to upload — visitors see this first when they scan the sign"
        pendingDataUrl={photo}
        onPick={setPhoto}
      />
      <SaveNote saver={saver} />
    </Dialog>
  );
}
