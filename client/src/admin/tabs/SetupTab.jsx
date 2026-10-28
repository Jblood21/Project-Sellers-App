import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { num } from '@shared/domain.js';
import { SETTING_NUMBER_RULES, creditOrderProblem, readSetting, withoutPercent } from '@shared/numberInput.js';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { fullDate } from '../../lib/format.js';
import { preparePhoto } from '../../lib/photos.js';
import { LowResNote, useLowRes } from '../lowRes.jsx';
import { useAdmin } from '../AdminContext.jsx';
import { isListing } from '../listing.js';
import DeleteListingCard from '../setup/DeleteListingCard.jsx';
import ListingDetailsCard from '../setup/ListingDetailsCard.jsx';
import OpenHousesCard from '../setup/OpenHousesCard.jsx';
import {
  DEFAULT_LISTING_SETUP_PART, DEFAULT_SETUP_PART, LISTING_SETUP_PARTS, SETUP_PARTS,
} from '../shell/sections.js';
import CheckedField, { PROBLEM_RED } from '../setup/CheckedField.jsx';
import ComplianceCard from '../setup/ComplianceCard.jsx';
import FaqCard from '../setup/FaqCard.jsx';
import HomeHeadingCard from '../setup/HomeHeadingCard.jsx';
import IncentiveCard from '../setup/IncentiveCard.jsx';
import LayoutCard from '../setup/LayoutCard.jsx';
import LogoCard from '../setup/LogoCard.jsx';
import ListingAgentCard from '../setup/ListingAgentCard.jsx';
import RealtorsCard from '../setup/RealtorsCard.jsx';
import ThemeStudio from '../setup/ThemeStudio.jsx';
import { Disclosure, ErrorNote, Field, TextField } from '../ui.jsx';
import ReportButton from '../ReportButton.jsx';

// What "Check rate inbox" can change; everything else on the form is left alone.
const RATE_KEYS = ['rateConv', 'rateFha', 'rateVa', 'ratesUpdatedAt'];

// The fields of each section that folds, for its "unsaved" mark and its one-line summary.
const COST_KEYS = ['taxPctYr', 'insuranceYr', 'hoaMo'];
const DPA_KEYS = ['dpaProgram', 'dpaIncomeLimit', 'dpaMinCredit', 'dpaPriceCap', 'dpaAmount', 'dpaPct', 'dpaAsOf'];
const CREDIT_KEYS = ['creditExcellentMin', 'creditGoodMin', 'creditFairMin'];
// Every box that must hold a number, and which fold it is in, so a refusal can open the fold and go to the box.
const FOLD_OF = {
  rateConv: 'rates', rateFha: 'rates', rateVa: 'rates',
  taxPctYr: 'costs', insuranceYr: 'costs', hoaMo: 'costs',
  dpaIncomeLimit: 'dpa', dpaMinCredit: 'dpa', dpaPriceCap: 'dpa', dpaAmount: 'dpa', dpaPct: 'dpa',
};
const orDash = (value) => (withoutPercent(value) || '–');
// Boxes that sit three across on a wide screen and two (then one) when a sentence under them needs the room.
const BOXES = { gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' };

/** Every value on this tab flows straight into the buyer tools. */
export default function SetupTab({ community, reload, dirtyRef, part = '', visitors = null, onDeleteListing }) {
  const { token, isOwner } = useAdmin();
  // A listing (one home an agent is selling) opens on its own part, Listing, ahead of the four a community has, and
  // leaves out what only makes sense for a development (the builder incentive, the site map).
  const listing = isListing(community);
  const parts = listing ? LISTING_SETUP_PARTS : SETUP_PARTS;
  const active = parts.some((item) => item.key === part) ? part : (listing ? DEFAULT_LISTING_SETUP_PART : DEFAULT_SETUP_PART);
  const [settings, setSettings] = useState(community.settings);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  // The three folds the numbers live in. Open from outside so a refused box can be brought into view, and so the
  // note from "Check for new rates" lands where it is read.
  const [folds, setFolds] = useState({ rates: false, costs: false, dpa: false });
  const [ratesNote, setRatesNote] = useState('');
  // A box is judged once the person has left it (judging "7" on the way to "740" would only scold), and every box
  // is judged once they press Save settings.
  const [left, setLeft] = useState({});
  const [tried, setTried] = useState(false);

  // The saved values can change under an open form (checking the rate inbox, a
  // logo upload, a layout change all reload the community). Replacing the form
  // then would throw away compliance text that was typed but not yet saved, so
  // only the fields the person has NOT touched take the new saved value.
  const savedSettings = JSON.stringify(community.settings);
  const lastSaved = useRef(community.settings);
  useEffect(() => {
    const before = lastSaved.current;
    const after = JSON.parse(savedSettings);
    lastSaved.current = after;
    setSettings((prev) => Object.fromEntries(Object.keys(after).map((key) => [
      key,
      JSON.stringify(prev[key]) === JSON.stringify(before[key]) ? after[key] : prev[key],
    ])));
  }, [savedSettings]);

  const dirty = JSON.stringify(settings) !== JSON.stringify(community.settings);
  const set = (key) => (value) => setSettings((prev) => ({ ...prev, [key]: value }));
  // Whether any of a section's fields differ from what is saved, so a folded section can still say so.
  const changed = (keys) => keys.some((key) => (settings[key] ?? '') !== (community.settings[key] ?? ''));
  const unsavedTag = (keys) => (changed(keys) ? <span className="tag tag-accent">Unsaved changes</span> : null);

  // What is wrong with the numbers, box by box. Only a box the person has changed is judged: a figure saved before
  // these rules, which they did not touch, must never be what stops them saving something else.
  const numberProblems = {};
  for (const key of Object.keys(SETTING_NUMBER_RULES)) {
    if (String(settings[key] ?? '') === String(community.settings[key] ?? '')) continue;
    const { error: why } = readSetting(key, settings[key]);
    if (why) numberProblems[key] = why;
  }
  const creditOrder = CREDIT_KEYS.some((key) => key in numberProblems) || !changed(CREDIT_KEYS) ? '' : creditOrderProblem(settings);
  const problemOf = (key) => (tried || left[key] ? numberProblems[key] ?? '' : '');
  const orderShown = tried || CREDIT_KEYS.every((key) => left[key]) ? creditOrder : '';
  // Why Save settings sent nothing. Worked out from the boxes as they are now, not remembered from the press, so it
  // goes the moment the last box is put right and never points at a box that is no longer red.
  const refusal = tried && (Object.keys(numberProblems).length
    ? 'Some boxes need fixing before this can be saved. They are marked in red.'
    : creditOrder);
  // A rate or cost, read as it is left: "7.5%" becomes 7.5 and "1.4k" becomes 1400 once the person is done with the box.
  const leave = (key) => {
    setLeft((prev) => ({ ...prev, [key]: true }));
    const read = readSetting(key, settings[key]);
    if (!read.error && read.text !== (settings[key] ?? '')) setSettings((prev) => ({ ...prev, [key]: read.text }));
  };
  const numberField = (key, label, extra = {}) => (
    <CheckedField
      key={key} id={`setting-${key}`} label={label} value={settings[key]} inputMode={extra.inputMode ?? 'decimal'}
      onChange={set(key)} onBlur={() => leave(key)} error={problemOf(key)} hint={extra.hint}
      // "e.g." so a grey example is never read as a figure that is already in the box.
      placeholder={extra.placeholder ? `e.g. ${extra.placeholder}` : undefined}
      invalid={key in FOLD_OF ? false : Boolean(orderShown)} autoComplete="off"
    />
  );

  // The listing cards (details, open houses) save on their own and keep their own unsaved edits; they tell this page
  // so a tab switch asks before throwing them away, the way it does for the form below.
  const formDirty = useRef(false);
  const cardsDirty = useRef({});
  const syncDirty = useCallback(() => {
    if (dirtyRef) dirtyRef.current = formDirty.current || Object.values(cardsDirty.current).some(Boolean);
  }, [dirtyRef]);
  const trackDetails = useCallback((value) => {
    cardsDirty.current.details = value;
    syncDirty();
  }, [syncDirty]);
  const trackOpenHouses = useCallback((value) => {
    cardsDirty.current.openHouses = value;
    syncDirty();
  }, [syncDirty]);

  // CommunityDetail reads this to ask before a tab switch throws the edits away,
  // and the browser is asked to do the same before the page is closed or reloaded.
  useEffect(() => {
    formDirty.current = dirty;
    syncDirty();
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      // Older browsers need a value set; the text itself is never shown.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, syncDirty]);
  useEffect(() => () => {
    if (dirtyRef) dirtyRef.current = false;
  }, [dirtyRef]);

  const saveSettings = async () => {
    setTried(true);
    setError('');
    // A rate or cost that is not a number in a sensible range is not sent: it says why, under its box, and the fold
    // it is in is opened so it can be seen. The server refuses the same values, for anything that gets past this.
    const wrong = Object.keys(numberProblems)[0];
    if (wrong || creditOrder) {
      const key = wrong ?? CREDIT_KEYS[0];
      setFolds((prev) => ({ ...prev, [FOLD_OF[key] ?? 'credit']: true }));
      window.setTimeout(() => document.getElementById(`setting-${key}`)?.focus(), 0);
      return;
    }
    setSaving(true);
    try {
      // Only what was changed on this page: sending every value it loaded would put back, over anything saved since
      // (a second admin, the rates webhook, a figures refresh on deploy), whatever this page was opened with.
      const changed = Object.fromEntries(
        Object.entries(settings).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(community.settings?.[key])),
      );
      // The rates and costs go as they were read ("7.5%" as 7.5): the server drops the same stray marks.
      for (const key of Object.keys(changed)) {
        if (key in SETTING_NUMBER_RULES) changed[key] = readSetting(key, changed[key]).text;
      }
      await adminApi.updateCommunity(token, community.id, { settings: changed });
      const fresh = await reload();
      // The server trims and caps what it stores. Showing the form what was
      // really saved (not what was typed) is what makes "Saved" true, and it
      // clears the unsaved mark even when the stored value did not change.
      if (fresh) setSettings(JSON.parse(JSON.stringify(fresh.settings)));
      // Saved, so the boxes start clean again: the next one to go wrong is told once it is left, not at once.
      setTried(false);
      setLeft({});
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const checkRates = async () => {
    setError('');
    try {
      const result = await adminApi.checkRates(token, community.id);
      // Only the rate fields: the form may hold unsaved lender or compliance text.
      setSettings((prev) => ({
        ...prev,
        ...Object.fromEntries(RATE_KEYS.map((key) => [key, result.settings[key]])),
      }));
      await reload();
      if (!result.webhookConfigured) {
        // Setting a secret and pointing Zapier somewhere is the owner's to do; a member is told what they can do.
        setRatesNote(isOwner
          ? 'No rate inbox connected yet — set RATES_WEBHOOK_SECRET and point Zapier at /api/communities/' +
            community.id + '/rates. Rates can be typed by hand meanwhile, under Live rates on Rates & rules.'
          : 'Automatic rate updates are not set up. Type the rates below, or ask the account owner.');
        setFolds((prev) => ({ ...prev, rates: true }));
      } else {
        setRatesNote('');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="ax-setup" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Four parts, each its own address. The form is one: all four stay mounted and only the one in view shows, so
          what is typed in any card (a FAQ row, a realtor's form) is still there when you come back, and one Save
          settings saves them all. */}
      <nav className="as-parts" aria-label="Setup parts">
        {parts.map((item) => (
          <Link
            key={item.key}
            to={`/admin/communities/${community.id}/setup/${item.key}`}
            className={`as-part${item.key === active ? ' active' : ''}`}
            aria-current={item.key === active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {listing ? (
        <div className="as-part-body" hidden={active !== 'listing'}>
          <ListingDetailsCard community={community} reload={reload} onDirty={trackDetails} />
          <OpenHousesCard community={community} reload={reload} onDirty={trackOpenHouses} />
          <DeleteListingCard listing={community} visitors={visitors} onDelete={onDeleteListing} />
        </div>
      ) : null}

      <div className="as-part-body ax-look" hidden={active !== 'look'}>
      <LayoutCard community={community} reload={reload} />

      {/* The colours: a try-on studio whose preview is this community's own buyer app, in its layout. Like the layout
          above, it saves on its own (only when "Use" is pressed) and never waits on Save settings. */}
      <ThemeStudio community={community} reload={reload} />

      <LogoCard community={community} reload={reload} />

      <CommunityArtwork community={community} reload={reload} />
      </div>

      <div className="as-part-body" hidden={active !== 'team'}>
      {listing ? <ListingAgentCard community={community} reload={reload} /> : <RealtorsCard community={community} reload={reload} />}

      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">{listing ? 'Showing request alerts' : 'Call request alerts'}</span>
        <TextField
          label={listing ? 'Send showing requests to' : 'Send call requests to'}
          value={settings.notifyEmail}
          onChange={set('notifyEmail')}
          inputMode="email"
          placeholder={listing ? 'you@yourbrokerage.com' : 'sales@yourcompany.com'}
        />
        <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
          Leave blank to use the account you sign in with.{' '}
          {listing
            ? 'A visitor asking for a showing is time-sensitive, so this is the one thing the app will email you about.'
            : 'A buyer asking for a call is time-sensitive, so this is the one thing the app will email you about.'}
        </span>
        <EmailStatus status={community.emailStatus} />
      </div>

      {/* Its own card: the address is saved with the rest, and the button sends to the SAVED address. */}
      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">{listing ? 'Visitor report' : 'Lead report'}</span>
        <TextField
          label={listing ? 'Send visitor reports to' : 'Send lead reports to'}
          value={settings.reportEmail}
          onChange={set('reportEmail')}
          inputMode="email"
          placeholder={listing ? 'you@yourbrokerage.com' : 'sales@yourcompany.com'}
        />
        <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
          One address. The report lists {listing ? 'the visitors who signed up since the last report' : 'the scheduled calls still waiting and the people who signed up since the last report'}. The spreadsheet attached has everyone, with their phone numbers (including {listing ? 'visitors' : 'people'} who said
          no to calls and texts), your notes and status. {listing ? 'Visitors' : 'People'} you have closed are left out. It is sent only when you press the button,
          never on its own, and changing the address does not change who counts as new.
        </span>
        <ReportButton
          community={community}
          reload={reload}
          blocked={(settings.reportEmail ?? '') !== (community.settings.reportEmail ?? '') ? 'Save settings first: the report goes to the saved address.' : ''}
        />
      </div>
      </div>

      <div className="as-part-body" hidden={active !== 'home'}>
      <HomeHeadingCard community={community} settings={settings} setSettings={setSettings} />
      {listing ? null : <IncentiveCard community={community} settings={settings} setSettings={setSettings} reload={reload} />}
      <FaqCard community={community} settings={settings} setSettings={setSettings} reload={reload} />
      </div>

      <div className="as-part-body" hidden={active !== 'rules'}>
      <ComplianceCard community={community} settings={settings} setSettings={setSettings} reload={reload} />

      {listing ? null : (
      <Disclosure
        title="Live rates"
        summary={`Conv ${orDash(settings.rateConv)}% · FHA ${orDash(settings.rateFha)}% · VA ${orDash(settings.rateVa)}% · updated ${settings.ratesUpdatedAt ? fullDate(settings.ratesUpdatedAt) : 'never'}`}
        tag={unsavedTag(['rateConv', 'rateFha', 'rateVa'])}
        open={folds.rates}
        onOpenChange={(open) => setFolds((prev) => ({ ...prev, rates: open }))}
        actions={(
          <button type="button" className="btn btn-ghost" onClick={checkRates} style={{ minHeight: 44, fontSize: 14 }}>
            {isOwner ? 'Check rate inbox' : 'Check for new rates'}
          </button>
        )}
      >
        {ratesNote ? <p role="status" className="ax-status" style={{ margin: 0 }}>{ratesNote}</p> : null}
        <div className="grid-3" style={BOXES}>
          {numberField('rateConv', 'Conv %', { placeholder: '6.75' })}
          {numberField('rateFha', 'FHA %', { placeholder: '6.50' })}
          {numberField('rateVa', 'VA %', { placeholder: '6.25' })}
        </div>
        <span className="text-muted" style={{ fontSize: 14 }}>
          Updated {settings.ratesUpdatedAt ? fullDate(settings.ratesUpdatedAt) : 'never'}
          {isOwner ? ' · a Zapier email parser can post new rates to this community automatically.' : '.'}
        </span>
      </Disclosure>
      )}

      <Disclosure
        title="Monthly cost assumptions"
        summary={`Tax ${orDash(settings.taxPctYr)}%/yr · Insurance $${orDash(settings.insuranceYr)}/yr · HOA ${withoutPercent(settings.hoaMo) ? `$${withoutPercent(settings.hoaMo)}/mo` : 'none'}`}
        tag={unsavedTag(COST_KEYS)}
        open={folds.costs}
        onOpenChange={(open) => setFolds((prev) => ({ ...prev, costs: open }))}
      >
        <div className="grid-3" style={BOXES}>
          {numberField('taxPctYr', 'Tax %/yr', { placeholder: '0.55' })}
          {numberField('insuranceYr', 'Insurance $/yr', { placeholder: '1400' })}
          {numberField('hoaMo', listing ? 'HOA dues per month, if this home has one' : 'HOA $/mo', { placeholder: '45', hint: listing ? 'Leave blank if there is none.' : 'Blank if there is no HOA.' })}
        </div>
      </Disclosure>

      {listing ? null : (
        <>
      <Disclosure
        title="Down payment assistance rules"
        summary={[
          String(settings.dpaProgram ?? '').trim() || (listing ? 'Assistance program' : 'Community assistance program'),
          String(settings.dpaAmount ?? '').trim() ? `$${String(settings.dpaAmount).trim()}` : String(settings.dpaPct ?? '').trim() ? `${withoutPercent(settings.dpaPct)}% of loan` : 'no amount set',
          String(settings.dpaPriceCap ?? '').trim() ? `price cap $${String(settings.dpaPriceCap).trim()}` : null,
          settings.dpaAsOf ? `checked ${fullDate(`${settings.dpaAsOf}T00:00:00`)}` : null,
        ].filter(Boolean).join(' · ')}
        tag={unsavedTag(DPA_KEYS)}
        open={folds.dpa}
        onOpenChange={(open) => setFolds((prev) => ({ ...prev, dpa: open }))}
      >
        <TextField
          label="Program name"
          hint="Shown to buyers by name. Leave blank and it reads as “this community’s assistance program”."
          value={settings.dpaProgram}
          onChange={set('dpaProgram')}
          placeholder="Utah SB 240 first-time buyer"
        />
        <div className="grid-3" style={BOXES}>
          {numberField('dpaIncomeLimit', 'Income limit $', { placeholder: '162500' })}
          {numberField('dpaMinCredit', 'Min credit', { placeholder: '660', inputMode: 'numeric' })}
          {numberField('dpaPriceCap', 'Price cap $', {
            hint: 'The program\'s purchase-price ceiling. Homes above it are marked as not covered. Blank = no cap.',
            placeholder: '450000',
          })}
        </div>
        <div className="grid-3" style={BOXES}>
          {numberField('dpaAmount', 'Assist amount $', {
            hint: 'A flat figure on its own. With a % below, this becomes the most the program will pay.',
          })}
          {numberField('dpaPct', 'or % of loan', {
            hint: 'Leave blank for a flat amount. Set it and the help scales with each home\'s price.',
            placeholder: '6',
          })}
          <TextField
            label="Rules checked on"
            hint="Shown to buyers. Limits reset every year and funded programs run out."
            value={settings.dpaAsOf}
            onChange={set('dpaAsOf')}
            type="date"
          />
        </div>
      </Disclosure>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <span className="card-kicker">Credit range cutoffs</span>
        <div className="grid-3" style={BOXES}>
          {numberField('creditExcellentMin', 'Excellent ≥', { inputMode: 'numeric', placeholder: '740' })}
          {numberField('creditGoodMin', 'Good ≥', { inputMode: 'numeric', placeholder: '700' })}
          {numberField('creditFairMin', 'Fair ≥', { inputMode: 'numeric', placeholder: '660' })}
        </div>
        {orderShown ? <span role="alert" style={{ color: PROBLEM_RED, fontSize: 14, lineHeight: 1.4 }}>{orderShown}</span> : null}
        <span className="text-muted" style={{ fontSize: 14 }}>
          Buyers see these as ranges, e.g. &ldquo;Good {settings.creditGoodMin}–{num(settings.creditExcellentMin) - 1}&rdquo;.
        </span>
      </div>
        </>
      )}
      </div>

      {/* Sticky: the lender and compliance fields sit mid-page, a long way above the foot. Look & feel saves as you go, so it only needs the bar once something is waiting. */}
      {dirty || error || refusal || (active !== 'look' && active !== 'listing') ? (
      <div className={`ax-savebar${error || refusal ? ' ax-savebar--note' : ''}`}>
        <ErrorNote>{error || refusal}</ErrorNote>
        <button
          type="button" className="btn btn-primary btn-block" onClick={saveSettings}
          disabled={!dirty || saving} style={{ minHeight: 46 }}
        >
          {saving ? 'Saving…' : dirty ? 'Save settings' : savedAt ? 'Saved ✓' : 'Saved'}
        </button>
      </div>
      ) : null}
    </div>
  );
}

function CommunityArtwork({ community, reload }) {
  const { token } = useAdmin();
  const listing = isListing(community);
  const { hash } = useLocation();
  const card = useRef(null);
  const heroInput = useRef(null);
  const iconInput = useRef(null);
  const [error, setError] = useState('');
  const lowRes = {
    hero: useLowRes('hero', community.heroPhoto?.url),
    icon: useLowRes('icon', community.iconPhoto?.url),
  };

  // A community card on Today with no picture, or one that fails to load, links here (#artwork). This card is the last
  // of Look & feel, screens below the top, so it is brought into view and the hero photo's slot takes the focus,
  // ready to pick a file.
  useEffect(() => {
    if (hash !== '#artwork') return;
    card.current?.scrollIntoView({ block: 'start' });
    document.getElementById('artwork-hero')?.focus({ preventScroll: true });
  }, [hash]);

  const upload = (kind) => async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      const picked = await preparePhoto(file, { kind: kind === 'icon' ? 'icon' : 'photo' });
      lowRes[kind].picked({ width: picked.width, height: picked.height });
      await adminApi.addCommunityPhoto(token, community.id, kind, { dataUrl: picked.dataUrl });
      await reload();
    } catch (err) {
      lowRes[kind].picked(null);
      setError(err.message);
    }
  };

  const slot = (kind, label, hint, inputRef, photo, height) => (
    <Field label={label}>
      <button
        type="button"
        id={`artwork-${kind}`}
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', height, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
          border: '1.5px dashed var(--color-neutral-400)', background: 'transparent', padding: 0,
        }}
      >
        {photo ? (
          <Photo
            photo={photo} alt={label} sizes="(min-width: 1240px) 1180px, 100vw"
            onMeasure={lowRes[kind].measured}
          />
        ) : <span className="text-muted" style={{ fontSize: 14 }}>{hint}</span>}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload(kind)} />
      <LowResNote>{photo ? lowRes[kind].note : ''}</LowResNote>
    </Field>
  );

  return (
    <div className="card elev-sm" id="artwork" ref={card} style={{ gap: 12 }}>
      <span className="card-kicker">{listing ? 'Listing artwork' : 'Community artwork'}</span>
      {slot('hero', 'Hero photo (QR landing)', listing ? 'Tap to upload a cover photo' : 'Tap to upload the community photo', heroInput, community.heroPhoto, 140)}
      {slot('icon', 'App icon (Add to Home Screen)', 'Tap to upload a square icon', iconInput, community.iconPhoto, 90)}
      {listing ? (
        <span className="text-muted" style={{ fontSize: 14 }}>
          The home&apos;s own photos, floor plans and video are on The home tab.
        </span>
      ) : (
        <span className="text-muted" style={{ fontSize: 14 }}>
          The site map lives with the homes it places, on the Homes tab.
        </span>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

/**
 * Whether the site can send email, said plainly. Alerts, a buyer's emailed plan and the "Email us" form all
 * depend on it, and it is set in Render, not here, so without this a builder finds out by an alert that never comes.
 * Render and the keys behind it are the account owner's: a member is told the same fact and who can fix it.
 */
function EmailStatus({ status }) {
  const { isOwner } = useAdmin();
  if (!status) return null;
  const style = { fontSize: 14, lineHeight: 1.45, fontWeight: 600, margin: 0 };
  if (!status.ready) {
    return (
      <p role="status" style={{ ...style, color: '#8a1c11' }}>
        {isOwner
          ? 'Email is off for this site, so no alerts, emailed plans or “Email us” messages are being sent. In Render, open Environment and add RESEND_API_KEY and EMAIL_FROM (an address on a domain you verified in Resend), then redeploy.'
          : 'Email alerts are not working right now. Tell the account owner.'}
      </p>
    );
  }
  if (!status.senderSet) {
    return (
      <p role="status" style={{ ...style, color: '#8a1c11' }}>
        {isOwner
          ? 'Email is on, but EMAIL_FROM is not set in Render, so it goes out from Resend’s test address, which only delivers to your own Resend account. Set EMAIL_FROM to an address on a domain you verified in Resend.'
          : 'Email alerts may not reach everyone right now. Tell the account owner.'}
      </p>
    );
  }
  return <p role="status" style={style} className="text-muted">Email is on.</p>;
}
