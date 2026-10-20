import { homeGreeting, settingMaxLength } from '@shared/domain.js';
import { TextAreaField, TextField } from '../ui.jsx';

const KEYS = ['homeHeadline', 'homeSubhead'];
const grouped = (n) => n.toLocaleString('en-US');

/** What each layout says when the builder writes nothing, so the fields can show it and the preview can fall back to it. */
const DEFAULTS = {
  foyer: { headline: 'Hello, {name}.', subhead: 'Can you buy one of these? Find out what works for you, and build your own home plan.' },
  marketplace: {
    headline: 'Homes at {community}',
    subhead: 'Every home for sale here, with what it could cost you each month. Save the ones you like.',
  },
  // With homes listed and the Payment tool on, which is how a buyer usually first sees it.
  redrock: {
    headline: 'Hi {name}. Could one of these be yours?',
    subhead: 'Tap any home to see your real monthly payment, with taxes, insurance and HOA in it.',
  },
  // The count is the buyer's own place on the trail; this is how it reads before the first stop.
  trailhead: {
    headline: 'Hi {name}.',
    subhead: 'Stop 1 of 8 on your way home',
  },
  showcase: {
    headline: 'Hi {name}. Meet the homes at {community}.',
    subhead: 'One home at a time, with what it could cost you each month.',
  },
  other: { headline: 'Hi {name} — can you buy one of these?', subhead: 'Take a few minutes to find out what works for you and build your own home plan.' },
};

/**
 * The heading at the top of the buyer app's home screen ("Hi Dana — can you buy one of these?") and the line under
 * it, in the builder's own words. Saved with the rest of the page by Save settings; blank keeps the layout's own.
 */
export default function HomeHeadingCard({ community, settings, setSettings }) {
  const saved = community.settings ?? {};
  const unsaved = KEYS.some((key) => (settings[key] ?? '') !== (saved[key] ?? ''));
  const fallback = DEFAULTS[community.layout] ?? DEFAULTS.other;
  const set = (key) => (value) => setSettings((prev) => ({ ...prev, [key]: value }));
  const preview = homeGreeting(
    { homeHeadline: settings.homeHeadline || fallback.headline, homeSubhead: settings.homeSubhead || fallback.subhead },
    { firstName: 'Dana', community: community.name },
  );
  const headline = String(settings.homeHeadline ?? '');
  const subhead = String(settings.homeSubhead ?? '');

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="card-kicker">Home screen heading</span>
        {unsaved ? <span className="tag tag-accent">Unsaved changes</span> : null}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        The first words a buyer reads after they sign in. Leave a box empty to keep the wording shown in grey.
        Type <strong>{'{name}'}</strong> for the buyer&apos;s first name and <strong>{'{community}'}</strong> for {community.name}.
      </p>
      <TextField
        id="setting-homeHeadline"
        label="Heading"
        value={headline}
        onChange={set('homeHeadline')}
        placeholder={fallback.headline}
        maxLength={settingMaxLength('homeHeadline')}
        hint={`Up to ${grouped(settingMaxLength('homeHeadline'))} characters.`}
      />
      <TextAreaField
        id="setting-homeSubhead"
        label="The line under it"
        rows={2}
        value={subhead}
        onChange={set('homeSubhead')}
        placeholder={fallback.subhead}
        maxLength={settingMaxLength('homeSubhead')}
        counter={`${grouped(subhead.length)} of ${grouped(settingMaxLength('homeSubhead'))} characters`}
      />
      <div className="ax-preview" aria-label="How it reads for a buyer named Dana">
        <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, color: 'var(--color-text)' }}>{preview.headline}</p>
        <p>{preview.subhead}</p>
      </div>
      <span className="text-muted" style={{ fontSize: 12 }}>Shown for a buyer named Dana. It goes live when you press Save settings.</span>
    </div>
  );
}
