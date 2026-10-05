import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_GUIDE_IMAGE, DEFAULT_GUIDE_IMAGE_ALT, GUIDE_TEXT_MAX, normalizeLayout, slugify,
} from '@shared/domain.js';
import Markdown from '../../components/Markdown.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import ImageSlot from '../setup/ImageSlot.jsx';
import { Dialog, ErrorNote, Spinner, TextAreaField, TextField, Toggle } from '../ui.jsx';

const grouped = (n) => n.toLocaleString('en-US');
const count = (value, max) => `${grouped(value.length)} of ${grouped(max)} characters`;

/** The fields the form edits, taken from a guide the server returned. */
function formOf(guide) {
  const custom = guide.image !== DEFAULT_GUIDE_IMAGE;
  return {
    title: guide.title,
    category: guide.category,
    byline: guide.byline,
    note: guide.note,
    summary: guide.summary,
    slug: guide.slug,
    body: guide.body ?? '',
    // The server resolves a blank alt to the title for a custom picture. Showing
    // that back as if it were typed would freeze it: rename the guide later and
    // the picture's description would still carry the old title.
    imageAlt: custom && guide.imageAlt === guide.title ? '' : guide.imageAlt,
    published: Boolean(guide.published),
  };
}

/**
 * Edits one buyer guide.
 *
 * Text saves with the Save button; the picture saves the moment it is picked or
 * reset, like every other upload in the admin, so the dialog says so. The body is
 * fetched here rather than carried in the list, because thirteen guides of
 * several thousand words each would otherwise ride along on every page load.
 */
export default function GuideEditor({ community, guideId, onClose, onSaved }) {
  const { token } = useAdmin();
  const [guide, setGuide] = useState(null);
  const [form, setForm] = useState(null);
  const [base, setBase] = useState(null);
  const [image, setImage] = useState(DEFAULT_GUIDE_IMAGE);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminApi.guide(token, guideId)
      .then((loaded) => {
        if (cancelled) return;
        setGuide(loaded);
        setForm(formOf(loaded));
        setBase(formOf(loaded));
        setImage(loaded.image);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token, guideId]);

  const deferredBody = useDeferredValue(form?.body ?? '');
  const id = community.id;
  // Stable identities, so the preview does not re-parse the whole guide on every keystroke elsewhere.
  const resolveLink = useCallback(
    (href) => (href.endsWith('.md') ? `/c/${id}/guides/${href.slice(0, -3)}` : null),
    [id],
  );
  const noNavigation = useCallback(() => {}, []);
  const previewScope = useMemo(
    () => `b-app t-${community.theme} l-${normalizeLayout(community.layout)}`,
    [community.theme, community.layout],
  );

  if (!form) {
    return (
      <Dialog key="loading" title="Edit guide" onClose={onClose} actions={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}>
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Opening the guide…" />}
      </Dialog>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const isDefaultImage = image === DEFAULT_GUIDE_IMAGE;
  const set = (key) => (value) => {
    setSavedAt(0);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const altShown = form.imageAlt.trim() || (isDefaultImage ? DEFAULT_GUIDE_IMAGE_ALT : form.title);

  const requestClose = () => {
    if (dirty && !window.confirm('Discard your unsaved changes to this guide?')) return;
    onClose();
  };

  const save = async () => {
    if (!form.title.trim()) return setError('A guide needs a title.');
    setBusy(true);
    setError('');
    try {
      const patch = { ...form };
      // Only sent when deliberately edited: a PATCH carrying an unchanged slug
      // is harmless, but leaving it out means saving text can never move a link.
      if (form.slug === base.slug) delete patch.slug;
      const next = await adminApi.updateGuide(token, guideId, patch);
      const fresh = formOf({ ...next, body: next.body ?? form.body });
      setForm(fresh);
      setBase(fresh);
      setUnlocked(false);
      setSavedAt(Date.now());
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async (dataUrl) => {
    const photo = await adminApi.setGuideImage(token, guideId, { dataUrl });
    setImage(photo.url);
    // The server blanks the stock picture's description when a real photo
    // replaces it (it would be a false description of the new one). Mirror that
    // so the form does not offer to save the stale text back.
    if (base.imageAlt === DEFAULT_GUIDE_IMAGE_ALT) setBase((b) => ({ ...b, imageAlt: '' }));
    setForm((f) => (f.imageAlt === DEFAULT_GUIDE_IMAGE_ALT ? { ...f, imageAlt: '' } : f));
  };

  const resetImage = async () => {
    const reset = await adminApi.clearGuideImage(token, guideId);
    setImage(reset.image);
    // The old description was of the photo that is now gone. Clearing it here and
    // now keeps the stored guide from describing a picture it no longer shows.
    const cleared = await adminApi.updateGuide(token, guideId, { imageAlt: '' });
    setBase((b) => ({ ...b, imageAlt: cleared.imageAlt }));
    setForm((f) => ({ ...f, imageAlt: cleared.imageAlt }));
  };

  return (
    <Dialog
      key="loaded"
      wide
      title={`Edit guide: ${guide.title}`}
      onClose={requestClose}
      actions={
        <>
          {/* The error sits beside Save, because the form is long and Save stays in view:
              an error at the foot of the form would be scrolled out of sight. */}
          {error ? <div style={{ flex: '1 1 100%', textAlign: 'left' }}><ErrorNote>{error}</ErrorNote></div> : null}
          {savedAt ? <span className="ax-status" role="status" style={{ marginRight: 'auto', alignSelf: 'center' }}>Saved.</span> : null}
          <button type="button" className="btn btn-secondary" onClick={requestClose} style={{ minHeight: 44 }}>
            {dirty ? 'Cancel' : 'Close'}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty} style={{ minHeight: 44 }}>
            {busy ? 'Saving…' : 'Save guide'}
          </button>
        </>
      }
    >
      <div className="ax-editor">
        <div className="ax-editor-col">
          <TextField label="Title" value={form.title} onChange={set('title')} maxLength={GUIDE_TEXT_MAX.title} hint={`Up to ${GUIDE_TEXT_MAX.title} characters.`} />
          <div className="ax-cols">
            <TextField label="Category" value={form.category} onChange={set('category')} maxLength={GUIDE_TEXT_MAX.category} hint="Guides are grouped by this on the buyer's list." />
            <div className="field">
              <label htmlFor="guide-slug">Address</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  id="guide-slug" className="input" value={form.slug} readOnly={!unlocked}
                  onChange={(event) => set('slug')(event.target.value)} maxLength={GUIDE_TEXT_MAX.slug}
                  aria-describedby="guide-slug-note" style={unlocked ? undefined : { background: 'var(--color-neutral-200)' }}
                />
                {!unlocked ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setUnlocked(true)} style={{ minHeight: 44, flex: 'none' }}>
                    Change
                  </button>
                ) : null}
              </div>
              <span id="guide-slug-note" className="field-hint">
                {unlocked
                  ? `Changing it breaks any link already shared to this guide. It will be saved as “${slugify(form.slug) || '…'}”.`
                  : `/c/${community.id}/guides/${form.slug}`}
              </span>
            </div>
          </div>
          <TextField label="Byline" value={form.byline} onChange={set('byline')} maxLength={GUIDE_TEXT_MAX.byline} />
          <TextField label="Note under the byline" value={form.note} onChange={set('note')} maxLength={GUIDE_TEXT_MAX.note} hint="Usually a short disclaimer, shown in italics." />
          <TextAreaField
            label="Summary" rows={3} value={form.summary} onChange={set('summary')} maxLength={GUIDE_TEXT_MAX.summary}
            hint="Shown on the guide list and in search results."
            counter={count(form.summary, GUIDE_TEXT_MAX.summary)}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Toggle on={form.published} onChange={set('published')} label="Published" />
            <span style={{ fontSize: 13 }}>
              <strong>{form.published ? 'Published' : 'Hidden from buyers'}</strong>
              <span className="text-muted">{form.published ? ' · buyers can read it' : ' · only you can see it'}</span>
            </span>
          </div>

          <ImageSlot
            label="Guide picture"
            image={isDefaultImage ? null : image}
            fallback={{ url: DEFAULT_GUIDE_IMAGE, note: 'Using the shared picture every guide starts with.' }}
            alt={isDefaultImage ? DEFAULT_GUIDE_IMAGE_ALT : `${guide.title} picture as saved`}
            onPick={pickImage}
            onRemove={resetImage}
            removeWarning="Go back to the shared picture? Your uploaded picture is deleted."
            hint="Picture changes save as soon as they finish, not with Save guide. Remove goes back to the shared picture."
          />
          <TextField
            label="Picture description (alt text)" value={form.imageAlt} onChange={set('imageAlt')}
            maxLength={GUIDE_TEXT_MAX.imageAlt}
            placeholder={isDefaultImage ? DEFAULT_GUIDE_IMAGE_ALT : form.title}
            hint="Read aloud to people who cannot see the picture, and used by search engines. Blank uses the title."
          />

          <TextAreaField
            label="Guide text (Markdown)" rows={18} className="input ax-body" spellCheck
            value={form.body} onChange={set('body')} maxLength={GUIDE_TEXT_MAX.body}
            hint={'Use ## for a heading, **bold**, *italic*, [text](https://…) for a link and - for a list. Link to another guide as [text](its-address.md). HTML is shown as typed, never run.'}
            counter={count(form.body, GUIDE_TEXT_MAX.body)}
          />
        </div>

        <div className="ax-editor-col ax-sticky">
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }} className="text-muted" id="guide-preview-label">
            Preview as buyers see it
          </span>
          <div className="ax-preview-frame" role="region" aria-labelledby="guide-preview-label">
            <div className={previewScope}>
              <img className="ax-preview-hero" src={image} alt={altShown} />
              {form.category ? <p className="ax-preview-kicker">{form.category}</p> : null}
              <h3 className="b-head ax-preview-title">{form.title || 'Untitled guide'}</h3>
              {form.byline ? <p className="ax-preview-by">{form.byline}</p> : null}
              {form.note ? <p className="ax-preview-note">{form.note}</p> : null}
              <Markdown source={deferredBody} resolveLink={resolveLink} onInternalLink={noNavigation} />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
