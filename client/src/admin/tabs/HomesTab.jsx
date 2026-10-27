import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  AVAILABILITY, isSold, MAX_PHOTOS_PER_HOME, MAX_VIDEO_BYTES, megabytes, money, unitsLabel, videoEmbed,
} from '@shared/domain.js';
import { HOME_NUMBER_RULES, readNumber } from '@shared/numberInput.js';
import { Trash } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { homeMeta } from '../../lib/format.js';
import { preparePhoto, videoToDataUrl } from '../../lib/photos.js';
import { LowResNote, rowNote, useLowRes, useLowResRow } from '../lowRes.jsx';
import { useAdmin } from '../AdminContext.jsx';
import { RemovalNotes, useRemovals } from '../homes/removals.jsx';
import { upcomingOf } from '../listing.js';
import CheckedField, { PROBLEM_RED } from '../setup/CheckedField.jsx';
import { Dialog, ErrorNote, Field, SaveNote, TextField, useSaving } from '../ui.jsx';

const BLANK = {
  name: '', price: '', beds: '', baths: '', sqft: '', description: '',
  availability: 'Planning', lotNumber: '', readyOn: '', unitsAvailable: '',
};

// The boxes that hold a number, in the order they sit in the dialog (the first one wrong is the one to go to).
const NUMBER_FIELDS = ['price', 'beds', 'baths', 'sqft'];
const COUNT_FIELDS = ['beds', 'baths', 'sqft'];

/**
 * Whether a number box holds something other than the saved home had. A home saved before these rules can carry a
 * figure they would refuse (a price of $475 from a "475k" that lost its k), and the person who only changes its
 * availability must not be stopped by a box they never touched. Typing the same figure another way ("$475,000"
 * for 475000, which the box does itself when it is left) is not a change either.
 */
function changedBox(form, base, key) {
  if (!base) return true;
  if (form[key].trim() === base[key].trim()) return false;
  const now = readNumber(form[key], HOME_NUMBER_RULES[key]);
  const was = readNumber(base[key], HOME_NUMBER_RULES[key]);
  return Boolean(now.error || was.error) || now.value !== was.value;
}

/**
 * What is wrong with the form, box by box: only a name and a real price are needed; the counts may be blank. When
 * editing, a number box is judged only if the person changed it (`base` is the form as the home was opened).
 */
function homeProblems(form, base) {
  const problems = {};
  if (!form.name.trim()) problems.name = 'Give the home a name.';
  for (const key of NUMBER_FIELDS) {
    if (!changedBox(form, base, key)) continue;
    const { error } = readNumber(form[key], HOME_NUMBER_RULES[key]);
    if (error) problems[key] = error;
  }
  return problems;
}

/**
 * The homes. A community lists as many as it has, each added and edited in a pop-up; a listing (`single`) is one home,
 * so its page is that home's editor open in place, with no Add and no Delete.
 */
export default function HomesTab({ single = false, ...props }) {
  return single ? <SingleHome {...props} /> : <ManyHomes {...props} />;
}

function ManyHomes({ community, reload }) {
  const { token } = useAdmin();
  const [dialog, setDialog] = useState(null); // { mode: 'new' | 'edit', home }
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A message shows under a box once the person has left it, and under every box once they press Add or Save, so the
  // form does not scold a field they have not got to yet.
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState({});
  const removals = useRemovals(reload);

  const openNew = () => {
    setForm(BLANK);
    setTried(false);
    setLeft({});
    setError('');
    setDialog({ mode: 'new' });
  };

  const openEdit = (home) => {
    const opened = {
      name: home.name,
      price: String(home.price),
      // 0 is how a box left blank is kept ("not given"), so it comes back as a blank box, not as a figure.
      beds: home.beds ? String(home.beds) : '',
      baths: home.baths ? String(home.baths) : '',
      sqft: home.sqft ? String(home.sqft) : '',
      description: home.description,
      availability: AVAILABILITY.includes(home.availability) ? home.availability : 'Planning',
      // null becomes an empty box; 0 has to survive as '0', because a sold home
      // that reopens as an uncounted one is the bug this field invites.
      unitsAvailable: home.unitsAvailable === null || home.unitsAvailable === undefined
        ? ''
        : String(home.unitsAvailable),
      lotNumber: home.lotNumber ?? '',
      readyOn: home.readyOn ?? '',
    };
    setForm(opened);
    setTried(false);
    setLeft({});
    setError('');
    setDialog({ mode: 'edit', home, base: opened });
  };

  const problems = homeProblems(form, dialog?.base);
  const problemOf = (key) => (tried || left[key] ? problems[key] ?? '' : '');
  const leave = (key) => setLeft((prev) => ({ ...prev, [key]: true }));
  const priceRead = readNumber(form.price, HOME_NUMBER_RULES.price);
  // The first count that is wrong speaks for the row of three: three sentences side by side would not fit a phone.
  const countProblemKey = COUNT_FIELDS.find((key) => problemOf(key));

  const save = async () => {
    setTried(true);
    const first = Object.keys(problems)[0];
    if (first) {
      document.getElementById(`home-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The figures go as the numbers they were read as; a count left blank goes as '' and is kept as "not given".
      const body = { ...form };
      for (const key of NUMBER_FIELDS) {
        // A box left as it was opened is not sent, so a figure from before these rules is neither judged nor rewritten.
        if (!changedBox(form, dialog.base, key)) delete body[key];
        else body[key] = readNumber(form[key], HOME_NUMBER_RULES[key]).value ?? '';
      }
      if (dialog.mode === 'new') await adminApi.createHome(token, community.id, body);
      else await adminApi.updateHome(token, dialog.home.id, body);
      setDialog(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeHome = async (home) => {
    if (!window.confirm(`Remove ${home.name} and its photos? This cannot be undone.`)) return;
    await adminApi.deleteHome(token, home.id);
    await reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SiteMapCard community={community} reload={reload} />

      {community.homes.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 14 }}>
          No homes yet. Add the plans buyers will see when they scan the sign.
        </p>
      ) : null}

      {community.homes.map((home) => (
        <div key={home.id} className="card elev-sm" style={{ gap: 8 }}>
          <PhotoStrip home={home} communityId={community.id} reload={reload} removals={removals} />
          <FloorPlanStrip home={home} reload={reload} removals={removals} />
          <WalkthroughRow home={home} reload={reload} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="card-title" style={{ fontSize: 18 }}>{home.name}</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{money(home.price)}</span>
          </div>
          <span className="text-muted" style={{ fontSize: 14 }}>
            {/* Beds, baths and square feet left blank are "not given": buyers see nothing for them, and neither is a figure made up here. */}
            {[homeMeta(home) || 'Beds, baths and sq ft not given', home.lotNumber].filter(Boolean).join(' · ')}
          </span>
          {home.description ? <p className="card-body" style={{ margin: 0 }}>{home.description}</p> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="tag tag-accent-2">{home.availability}</span>
            {unitsLabel(home) ? (
              <span
                className="tag"
                style={isSold(home)
                  ? { background: '#fdecea', color: '#8a1c11' }
                  : { background: '#e9f7ef', color: '#1b5e37' }}
              >
                {unitsLabel(home)}
              </span>
            ) : null}
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-ghost" onClick={() => openEdit(home)} style={{ minHeight: 44, padding: '0 14px', fontSize: 14 }}>
                Edit
              </button>
              <button
                type="button" className="btn btn-danger" aria-label={`Delete ${home.name}`}
                onClick={() => removeHome(home)} style={{ minHeight: 44, minWidth: 44, padding: '0 12px' }}
              >
                <Trash />
              </button>
            </span>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-primary btn-block" onClick={openNew} style={{ minHeight: 46 }}>
        ＋ Add home
      </button>

      <RemovalNotes removals={removals} />

      {dialog ? (
        <Dialog
          title={dialog.mode === 'new' ? 'Add home' : 'Edit home'}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? (dialog.mode === 'new' ? 'Adding…' : 'Saving…') : dialog.mode === 'new' ? 'Add' : 'Save'}
              </button>
            </>
          }
        >
          <CheckedField
            id="home-name" label="Name" value={form.name} placeholder="e.g. The Maple"
            onChange={(name) => setForm((f) => ({ ...f, name }))} onBlur={() => leave('name')}
            error={problemOf('name')}
          />
          <CheckedField
            id="home-price" label="Base price" value={form.price} placeholder="e.g. 475000 or 475k"
            onChange={(price) => setForm((f) => ({ ...f, price }))}
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
          <TextField
            label="Lot number" value={form.lotNumber}
            onChange={(lotNumber) => setForm((f) => ({ ...f, lotNumber }))}
            placeholder="e.g. Lot 14"
          />
          <div className="grid-3">
            <CheckedField
              id="home-beds" label="Beds" value={form.beds} inputMode="numeric" invalid={Boolean(problemOf('beds'))}
              onChange={(beds) => setForm((f) => ({ ...f, beds }))} onBlur={() => leave('beds')}
            />
            <CheckedField
              id="home-baths" label="Baths" value={form.baths} inputMode="decimal" invalid={Boolean(problemOf('baths'))}
              onChange={(baths) => setForm((f) => ({ ...f, baths }))} onBlur={() => leave('baths')}
            />
            <CheckedField
              id="home-sqft" label="Sq ft" value={form.sqft} inputMode="numeric" invalid={Boolean(problemOf('sqft'))}
              onChange={(sqft) => setForm((f) => ({ ...f, sqft }))} onBlur={() => leave('sqft')}
            />
          </div>
          {countProblemKey ? (
            <span role="alert" style={{ color: PROBLEM_RED, fontSize: 14, lineHeight: 1.4 }}>{problems[countProblemKey]}</span>
          ) : (
            <span className="field-hint">
              Beds, baths and sq ft are optional. Leave one blank if you do not know it yet: buyers see nothing for it,
              and nothing is filled in for you.
            </span>
          )}
          <Field label="Description">
            <textarea
              className="input" rows={3} value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </Field>
          <Field label="Availability">
            <select
              className="input" value={form.availability}
              onChange={(event) => setForm((f) => ({ ...f, availability: event.target.value }))}
            >
              {AVAILABILITY.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field
            label="How many are left"
            hint="Leave blank for a one-off home on a lot — buyers just see its stage. Put a number here for a plan you have several of, and 0 when it is sold."
          >
            <input
              className="input" type="number" min="0" step="1" placeholder="Blank for a single home"
              value={form.unitsAvailable}
              onChange={(event) => setForm((f) => ({ ...f, unitsAvailable: event.target.value }))}
            />
          </Field>
          {form.availability === 'Move-in ready' ? null : (
            <Field
              label="Ready for keys"
              hint="Buyers plan their move — and their lease notice — around this. Left blank, their timeline says nobody has set a date rather than guessing one."
            >
              <input
                className="input" type="date" value={form.readyOn}
                onChange={(event) => setForm((f) => ({ ...f, readyOn: event.target.value }))}
              />
            </Field>
          )}
          <ErrorNote>{error}</ErrorNote>
        </Dialog>
      ) : null}
    </div>
  );
}

const seedOf = (home) => ({
  name: home.name,
  price: String(home.price),
  // 0 is how a box left blank is kept ("not given"), so it comes back as a blank box, not as a figure.
  beds: home.beds ? String(home.beds) : '',
  baths: home.baths ? String(home.baths) : '',
  sqft: home.sqft ? String(home.sqft) : '',
  description: home.description ?? '',
});

/**
 * A listing's one home, open for editing in place: its photos, floor plans and video above, and under them the
 * address, price, facts and description. The address is the listing's name too, so saving it renames both. Beds,
 * baths and square feet are optional, as for any home. There is no availability, lot number or count here: a
 * listing's stage is its status (Setup), and it is one home.
 */
function SingleHome({ community, reload }) {
  const { token } = useAdmin();
  const home = community.homes[0];
  const removals = useRemovals(reload);
  const saver = useSaving();
  const { state } = useLocation();
  const [form, setForm] = useState(() => (home ? seedOf(home) : null));
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState({});
  if (!home || !form) {
    return <p className="text-muted" style={{ fontSize: 14 }}>This listing has no home yet. Reload the page to try again.</p>;
  }

  const base = seedOf(home);
  const problems = homeProblems(form, base);
  if (problems.name) problems.name = 'Give the home an address.';
  const problemOf = (key) => (tried || left[key] ? problems[key] ?? '' : '');
  const leave = (key) => setLeft((prev) => ({ ...prev, [key]: true }));
  const priceRead = readNumber(form.price, HOME_NUMBER_RULES.price);
  const countProblemKey = COUNT_FIELDS.find((key) => problemOf(key));
  const dirty = form.name.trim() !== base.name || form.description !== base.description
    || NUMBER_FIELDS.some((key) => changedBox(form, base, key));
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    setTried(true);
    const first = Object.keys(problems)[0];
    if (first) {
      document.getElementById(`home-${first}`)?.focus();
      return Promise.resolve(false);
    }
    return saver.run(async () => {
      const body = { name: form.name.trim(), description: form.description };
      for (const key of NUMBER_FIELDS) {
        if (changedBox(form, base, key)) body[key] = readNumber(form[key], HOME_NUMBER_RULES[key]).value ?? '';
      }
      await adminApi.updateHome(token, home.id, body);
      // The address is the listing's name as well. If this second step fails, Retry repeats both: the same change twice.
      if (community.name !== body.name) await adminApi.updateCommunity(token, community.id, { name: body.name });
      const fresh = await reload();
      if (fresh?.homes?.[0]) setForm(seedOf(fresh.homes[0]));
      setTried(false);
      setLeft({});
    });
  };

  const sessionsToCome = upcomingOf(community).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {state?.notice ? <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 14 }}>{state.notice}</p> : null}

      <div className="card elev-sm" style={{ gap: 8 }}>
        <span className="card-kicker">Photos, floor plans and video</span>
        <PhotoStrip home={home} communityId={community.id} reload={reload} removals={removals} />
        <span className="text-muted" style={{ fontSize: 13 }}>
          The first photo is the one visitors see first. Use the ★ to move another to the front.
        </span>
        <FloorPlanStrip home={home} reload={reload} removals={removals} />
        <WalkthroughRow home={home} reload={reload} />
      </div>

      <div className="card elev-sm" style={{ gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="card-kicker">Address, price and facts</span>
          {dirty ? <span className="tag tag-accent">Unsaved changes</span> : null}
        </div>
        <CheckedField
          id="home-name" label="Address" value={form.name} placeholder="e.g. 123 Maple Street"
          onChange={set('name')} onBlur={() => leave('name')} error={problemOf('name')} autoComplete="off"
        />
        <CheckedField
          id="home-price" label="Price" value={form.price} placeholder="e.g. 475000 or 475k"
          onChange={set('price')}
          onBlur={() => {
            leave('price');
            if (!priceRead.error) setForm((f) => ({ ...f, price: money(priceRead.value) }));
          }}
          error={problemOf('price')}
          preview={!priceRead.error && form.price.trim() ? `Buyers will see ${money(priceRead.value)}` : ''}
          hint="In dollars. You can type 475000, 475,000, $475,000, 475k or 1.2m."
          autoComplete="off"
        />
        <div className="grid-3">
          <CheckedField
            id="home-beds" label="Beds" value={form.beds} inputMode="numeric" invalid={Boolean(problemOf('beds'))}
            onChange={set('beds')} onBlur={() => leave('beds')}
          />
          <CheckedField
            id="home-baths" label="Baths" value={form.baths} inputMode="decimal" invalid={Boolean(problemOf('baths'))}
            onChange={set('baths')} onBlur={() => leave('baths')}
          />
          <CheckedField
            id="home-sqft" label="Sq ft" value={form.sqft} inputMode="numeric" invalid={Boolean(problemOf('sqft'))}
            onChange={set('sqft')} onBlur={() => leave('sqft')}
          />
        </div>
        {countProblemKey ? (
          <span role="alert" style={{ color: PROBLEM_RED, fontSize: 14, lineHeight: 1.4 }}>{problems[countProblemKey]}</span>
        ) : (
          <span className="field-hint">
            Beds, baths and sq ft are optional. Leave one blank if you do not know it: visitors see nothing for it, and
            nothing is filled in for you.
          </span>
        )}
        <Field label="Description">
          <textarea
            className="input" rows={5} value={form.description}
            onChange={(event) => set('description')(event.target.value)}
          />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button" className="btn btn-primary" onClick={save}
            disabled={!dirty} aria-disabled={saver.saving || undefined} style={{ minHeight: 46 }}
          >
            {saver.saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <SaveNote saver={saver} />
      </div>

      {sessionsToCome === 0 ? (
        <div className="ax-callout ax-nudge">
          <span style={{ fontSize: 14, lineHeight: 1.45 }}>
            <strong>Next: add your open house times.</strong> Visitors see them on the home&apos;s page, and the sign
            points them there.
          </span>
          <Link className="btn btn-secondary" to={`/admin/communities/${community.id}/setup/listing#open-houses`}>
            Add an open house
          </Link>
        </div>
      ) : null}

      <RemovalNotes removals={removals} />
    </div>
  );
}

/**
 * Plans are kept apart from the photo carousel: a buyer swiping pictures of a
 * kitchen does not want a line drawing in the middle of them.
 */
function FloorPlanStrip({ home, reload, removals }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A plan taken off waits out its few seconds to be put back (see removals.jsx); until then it is out of sight here.
  const plans = (home.floorPlans ?? []).filter((plan) => !removals.hidden.has(plan.id));
  const lowRes = useLowResRow('floorplan', plans.map((plan) => plan.url));
  const smallPlans = new Set(lowRes.small.map((entry) => entry.url));

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const picked = await preparePhoto(file, { kind: 'drawing' });
      const added = await adminApi.addFloorPlan(token, home.id, { dataUrl: picked.dataUrl });
      // Known from the picture just picked, so a small one is pointed out without waiting for it to load.
      if (added?.url) lowRes.measured(added.url, { width: picked.width, height: picked.height });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', height: 54, display: 'flex', alignItems: 'center' }}>
          Floor plans
        </span>
        {plans.map((plan, index) => (
          <div key={plan.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
            <div style={{ position: 'relative', width: 54, height: 54 }}>
              <Photo
                photo={plan} radius={8} alt={`${home.name} floor plan ${index + 1}`} fit="contain" sizes="54px"
                onMeasure={(size) => lowRes.measured(plan.url, size)}
              />
              {smallPlans.has(plan.url) ? <span className="ax-lowres-badge" style={{ right: 2, bottom: 2, padding: '1px 5px' }}>Small</span> : null}
            </div>
            {/* Under the picture, not on it, and a full fingertip: a plan is small enough that a button on it was 20 px. */}
            <button
              type="button"
              aria-label={`Delete floor plan ${index + 1}`}
              onClick={() => removals.start({ id: plan.id, label: 'Floor plan' })}
              style={removeButton}
            >
              <Trash size={18} />
            </button>
          </div>
        ))}
        {plans.length < 4 ? (
          <button
            type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            aria-label={`Add a floor plan to ${home.name}`}
            style={{
              width: 54, height: 54, flex: 'none', borderRadius: 8,
              border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
              color: 'var(--color-neutral-700)', fontSize: 18, cursor: 'pointer',
            }}
          >
            {busy ? '…' : '＋'}
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload} />
      <LowResNote>{rowNote('floorplan', lowRes.small, 'Plan')}</LowResNote>
      <ErrorNote>{error}</ErrorNote>
    </>
  );
}

/**
 * The home's walkthrough: one video, uploaded from the device.
 *
 * One per home rather than a gallery, because every upload is database that
 * never shrinks and this one is multiplied by the number of homes — a dozen
 * homes at the 25MB cap is already 300MB. A builder with more to show has the
 * Videos & articles tab, where a link costs nothing.
 *
 * There is no link field here on purpose. A walkthrough is the thing a buyer
 * taps while they are looking at this home, and a YouTube frame takes them out
 * of the app to somewhere with a sidebar full of other builders' homes.
 */
function WalkthroughRow({ home, reload }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The upload can succeed and still be a file this browser cannot decode (an
  // iPhone's default HEVC .mov in most non-Apple browsers). Without this the
  // builder just sees a black box and concludes the upload failed. The fault is
  // remembered against the address that failed, so it goes with the video: removing
  // or replacing it gives a different address and the note no longer applies.
  const [playFault, setPlayFault] = useState({ url: '', kind: '' });
  // The other way to give a home a video tour: a YouTube or Vimeo link. A home has one or the other.
  const [link, setLink] = useState(home.videoLink ?? '');
  const linkEmbed = videoEmbed(link);
  const linkChanged = link.trim() !== (home.videoLink ?? '');

  const saveLink = async () => {
    setBusy(true);
    setError('');
    try {
      await adminApi.updateHome(token, home.id, { videoLink: link.trim() });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // A player error means one of two things that need opposite advice: the file cannot
  // be decoded (re-export it) or it could not be fetched (a dropped connection; the
  // file is fine). Ask for its first byte to tell them apart.
  const diagnose = async (event) => {
    const url = home.videoUrl;
    const code = event.currentTarget.error?.code;
    let reachable = false;
    try {
      reachable = (await fetch(url, { headers: { Range: 'bytes=0-0' } })).ok;
    } catch {
      reachable = false;
    }
    setPlayFault({ url, kind: reachable && (code === 3 || code === 4) ? 'codec' : 'load' });
  };
  const fault = playFault.url && playFault.url === home.videoUrl ? playFault.kind : '';

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await videoToDataUrl(file, MAX_VIDEO_BYTES, 'try a shorter clip.');
      await adminApi.setHomeVideo(token, home.id, { dataUrl });
      // A home has one source: the file replaced the link, so the field empties with it.
      setLink('');
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the walkthrough for ${home.name}? This cannot be undone.`)) return;
    await adminApi.deleteHomeVideo(token, home.id);
    await reload();
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          Video tour
        </span>
        {home.videoUrl ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={home.videoUrl}
              controls
              preload="metadata"
              onError={diagnose}
              style={{ width: 150, borderRadius: 8, background: '#000', flex: 'none' }}
            />
            <span className="text-muted" style={{ fontSize: 14 }}>
              {megabytes(home.videoSizeBytes)}
            </span>
            <button
              type="button" className="btn btn-ghost" onClick={() => inputRef.current?.click()}
              disabled={busy} style={{ minHeight: 44, padding: '0 10px', fontSize: 14 }}
            >
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button" className="btn btn-ghost" onClick={remove}
              style={{ minHeight: 44, padding: '0 10px', fontSize: 14 }}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            style={{
              minHeight: 44, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
              color: 'var(--color-neutral-700)', fontSize: 14,
            }}
          >
            {busy ? 'Uploading…' : `＋ Add a video · up to ${megabytes(MAX_VIDEO_BYTES)}`}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="video/*" hidden onChange={upload} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="text-muted" style={{ fontSize: 14 }}>
          {home.videoUrl ? 'Or replace it with a link:' : 'Or paste a YouTube or Vimeo link:'}
        </span>
        <input
          className="input" value={link} onChange={(event) => setLink(event.target.value)}
          placeholder="https://youtu.be/…" aria-label={`Video tour link for ${home.name}`}
          style={{ flex: '1 1 220px', minHeight: 44, fontSize: 14 }}
        />
        {linkChanged ? (
          <button
            type="button" className="btn btn-primary" onClick={saveLink}
            disabled={busy || (link.trim() !== '' && !linkEmbed)} style={{ minHeight: 44, padding: '0 12px', fontSize: 14 }}
          >
            {link.trim() ? 'Save link' : 'Remove link'}
          </button>
        ) : null}
      </div>
      {link.trim() && !linkEmbed ? (
        <span className="text-muted" style={{ fontSize: 14 }}>That is not a YouTube or Vimeo video link.</span>
      ) : null}
      {home.videoLink ? (
        <span className="text-muted" style={{ fontSize: 14 }}>
          Buyers see a “Watch the video tour” button that plays this link in the app.
        </span>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <ErrorNote>
        {error || !fault ? '' : fault === 'codec'
          ? 'This browser cannot play that file, so buyers on it will not see it either. Re-export it as MP4 (H.264) and replace it.'
          : 'The video did not load. Check your connection and reload the page.'}
      </ErrorNote>
    </>
  );
}

/**
 * The community plat, and the lot numbers that place homes on it.
 *
 * It lives here rather than with the hero photo and app icon because it is not
 * branding — it is the drawing a buyer holds next to the home list, and the lot
 * number on each home below is what ties the two together. A builder setting up
 * lots and a builder uploading the plat are the same person doing one job.
 */
function SiteMapCard({ community, reload }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const map = community.siteMap ?? null;
  const shown = Boolean(community.features?.siteMap);
  const lowRes = useLowRes('sitemap', map?.url);
  const placed = community.homes.filter((home) => home.lotNumber).length;

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const picked = await preparePhoto(file, { kind: 'drawing' });
      lowRes.picked({ width: picked.width, height: picked.height });
      await adminApi.addCommunityPhoto(token, community.id, 'sitemap', { dataUrl: picked.dataUrl });
      await reload();
    } catch (err) {
      lowRes.picked(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove the site map? Buyers will stop seeing it.')) return;
    setError('');
    try {
      await adminApi.deletePhoto(token, map.id);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const show = async () => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { siteMap: true } });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <span className="card-kicker">Site map</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={map ? 'Replace the site map' : 'Upload the site map'}
        style={{
          position: 'relative', width: '100%', height: 150, borderRadius: 12, overflow: 'hidden',
          cursor: 'pointer', padding: 0,
          border: `1.5px dashed ${map ? 'transparent' : 'var(--color-neutral-400)'}`,
          background: map ? 'var(--color-neutral-200)' : 'transparent',
        }}
      >
        {map ? (
          <>
            <Photo
              photo={map} alt="The community site map" sizes="(min-width: 1000px) 880px, 100vw"
              onMeasure={lowRes.measured}
            />
            <span
              style={{
                position: 'absolute', right: 8, bottom: 8, padding: '5px 12px', borderRadius: 999,
                background: 'rgba(14,34,40,.72)', color: '#fff', fontSize: 14, fontWeight: 600,
              }}
            >
              {busy ? 'Uploading…' : 'Replace'}
            </span>
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 14 }}>
            {busy ? 'Uploading…' : 'Tap to upload the plat buyers tap'}
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload} />
      <LowResNote>{map ? lowRes.note : ''}</LowResNote>

      {/*
        A map with no lot numbers on the homes is a picture, not a map: the buyer
        can see the plat but cannot tell which shape is the home they are standing
        in front of. Say so with the count rather than leaving them to notice.
      */}
      <span className="text-muted" style={{ fontSize: 14 }}>
        {map
          ? placed === 0
            ? 'No home has a lot number yet, so buyers cannot tell which shape is which. Add one when you edit a home.'
            : `${placed} of ${community.homes.length} homes carry a lot number, so buyers can place them on it.`
          : 'The plat drawing. Buyers open it full screen and match it to the lot numbers on your homes.'}
      </span>

      {/*
        Uploading is not publishing: the buyer app hides the map unless the Site
        map feature is on, which is a switch on another tab. Silently doing
        nothing is the worst version of this, so offer the switch here.
      */}
      {map && !shown ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 10, background: 'var(--color-neutral-200)',
          }}
        >
          <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>
            Buyers are not seeing this — <strong>Site map</strong> is switched off under Tools.
          </span>
          <button
            type="button" className="btn btn-secondary" onClick={show}
            style={{ flex: 'none', minHeight: 44, padding: '0 14px', fontSize: 14 }}
          >
            Show it
          </button>
        </div>
      ) : null}

      {map ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button" className="btn btn-ghost" onClick={remove}
            style={{ minHeight: 44, padding: '0 14px', fontSize: 14 }}
          >
            Remove
          </button>
        </div>
      ) : null}

      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

// Every button on a photo is a full fingertip (44 px) with room between them: the tiles sit in a strip that is
// swiped sideways, and the small round buttons that used to sit on the pictures were easy to hit by accident.
const tileButton = {
  minWidth: 44, minHeight: 44, borderRadius: 12, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--color-divider)', background: '#fff', color: 'var(--color-accent-700)',
};
// Deleting looks different from moving, so the two are not mistaken for each other.
const removeButton = {
  ...tileButton, fontSize: 16, border: '1px solid #e8b9b4', background: '#fdecea', color: '#8a1c11',
};

const TILE_WIDTH = 204;

function PhotoStrip({ home, reload, removals }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The downscaled photo, shown in place the moment it is ready, so the strip
  // fills in while the upload is still in flight rather than after it.
  const [pending, setPending] = useState(null);
  // A photo taken off waits out its few seconds to be put back (see removals.jsx); until then it is out of sight.
  const photos = home.photos.filter((photo) => !removals.hidden.has(photo.id));
  const lowRes = useLowResRow('home', photos.map((photo) => photo.url));
  const smallPhotos = new Set(lowRes.small.map((entry) => entry.url));

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const picked = await preparePhoto(file);
      setPending(picked.dataUrl);
      const added = await adminApi.addHomePhoto(token, home.id, { dataUrl: picked.dataUrl });
      // Known from the picture just picked, so a small one is pointed out without waiting for it to load.
      if (added?.url) lowRes.measured(added.url, { width: picked.width, height: picked.height });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  // The first photo is the hero buyers see at the top of the home. Moving a photo earlier or later (or
  // making it the hero) sends the whole new order; arrows rather than dragging, so it works on a phone.
  // `from` and `to` are places among the photos in view. The order sent has to name every photo the home has, so a
  // photo still waiting to be deleted keeps its place in it while the visible ones are moved around it.
  const move = async (from, to) => {
    if (to < 0 || to >= photos.length) return;
    const ids = home.photos.map((photo) => photo.id);
    const movedId = photos[from].id;
    const anchorId = photos[to].id;
    ids.splice(ids.indexOf(movedId), 1);
    const at = ids.indexOf(anchorId);
    ids.splice(from < to ? at + 1 : at, 0, movedId);
    setError('');
    try {
      await adminApi.reorderHomePhotos(token, home.id, ids);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="scroll-x" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        {photos.map((photo, index) => (
          <div key={photo.id} style={{ width: TILE_WIDTH, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative', width: TILE_WIDTH, height: 144 }}>
              <Photo
                photo={photo} radius={12} alt={`${home.name} photo ${index + 1}`} sizes="215px"
                onMeasure={(size) => lowRes.measured(photo.url, size)}
              />
              {smallPhotos.has(photo.url) ? <span className="ax-lowres-badge">Small</span> : null}
              {index === 0 ? (
                <span
                  style={{
                    position: 'absolute', left: 6, top: 6, padding: '3px 8px', borderRadius: 999, fontSize: 14,
                    fontWeight: 700, background: 'rgba(14,34,40,.85)', color: '#fff',
                  }}
                >
                  ★ Hero
                </span>
              ) : null}
            </div>
            {/* Under the picture rather than on it: nothing here is hit by a thumb that is only scrolling the strip. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {photos.length > 1 && index > 0 ? (
                <>
                  <button type="button" aria-label={`Make photo ${index + 1} the hero`} title={`Make photo ${index + 1} the hero`} onClick={() => move(index, 0)} style={tileButton}>
                    ★
                  </button>
                  <button type="button" aria-label={`Move photo ${index + 1} earlier`} title={`Move photo ${index + 1} earlier`} onClick={() => move(index, index - 1)} style={tileButton}>
                    ‹
                  </button>
                </>
              ) : null}
              {photos.length > 1 && index < photos.length - 1 ? (
                <button type="button" aria-label={`Move photo ${index + 1} later`} title={`Move photo ${index + 1} later`} onClick={() => move(index, index + 1)} style={tileButton}>
                  ›
                </button>
              ) : null}
              <button
                type="button"
                aria-label={`Delete photo ${index + 1}`}
                onClick={() => removals.start({ id: photo.id, label: 'Photo' })}
                style={{ ...removeButton, marginLeft: 'auto' }}
              >
                <Trash size={18} />
              </button>
            </div>
          </div>
        ))}
        {pending ? (
          <div style={{ position: 'relative', width: TILE_WIDTH, height: 144, flex: 'none' }}>
            <img
              src={pending}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, display: 'block', opacity: 0.55 }}
            />
            <span
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: 'var(--color-text)',
              }}
            >
              Uploading…
            </span>
          </div>
        ) : null}
        {home.photos.length < MAX_PHOTOS_PER_HOME ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Add photo"
            disabled={busy}
            style={{
              width: 64, height: 144, flex: 'none', borderRadius: 12,
              border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
              color: 'var(--color-neutral-700)', fontSize: 24, cursor: 'pointer',
            }}
          >
            {busy ? '…' : '＋'}
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload} />
      <LowResNote>{rowNote('home', lowRes.small, 'Photo')}</LowResNote>
      <ErrorNote>{error}</ErrorNote>
    </>
  );
}
