import { useRef, useState } from 'react';

import { MAX_VIDEO_BYTES, MAX_VIDEOS, megabytes, videoEmbed } from '@shared/domain.js';
import { Trash } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { videoToDataUrl } from '../../lib/photos.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, ErrorNote, Field, TextField } from '../ui.jsx';

const BLANK_ARTICLE = { kind: 'article', title: '', body: '' };
const BLANK_VIDEO = { kind: 'video', title: '', url: '', dataUrl: '', fileName: '' };

/**
 * What the builder has written and filmed.
 *
 * Deliberately secondary: the buyer sees this under the tools, because a buyer
 * who came to find out what they can afford should reach the calculators
 * first. It is here to answer the questions that come after, not to compete
 * with the ones that come before.
 */
export default function LearnTab({ community, reload }) {
  const { token } = useAdmin();
  const [dialog, setDialog] = useState(null); // { mode, kind, resource }
  const [form, setForm] = useState(BLANK_ARTICLE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef(null);

  const pickVideo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReading(true);
    setError('');
    try {
      // Picking a file clears any link: one source per video, decided here
      // rather than left for the server to arbitrate.
      const dataUrl = await videoToDataUrl(file, MAX_VIDEO_BYTES);
      setForm((f) => ({ ...f, dataUrl, fileName: file.name, url: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  const resources = community.resources ?? [];
  const articles = resources.filter((r) => r.kind === 'article');
  const videos = resources.filter((r) => r.kind === 'video');
  const shown = Boolean(community.features?.resources);
  const roomForVideos = MAX_VIDEOS - videos.length;

  const openNew = (kind) => {
    setForm(kind === 'video' ? BLANK_VIDEO : BLANK_ARTICLE);
    setError('');
    setDialog({ mode: 'new', kind });
  };

  const openEdit = (resource) => {
    setForm({
      kind: resource.kind, title: resource.title, body: resource.body, url: resource.url,
      dataUrl: '', fileName: '',
    });
    setError('');
    setDialog({ mode: 'edit', kind: resource.kind, resource });
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('Give this a title.');
      return;
    }
    if (form.kind === 'video') {
      const hasFile = Boolean(form.dataUrl);
      const hasLink = Boolean(form.url.trim());
      // On an edit, leaving both blank means "keep what is already there".
      const keeping = dialog.mode === 'edit' && !hasFile && !hasLink;
      if (!keeping) {
        if (!hasFile && !hasLink) {
          setError('Choose a video file, or paste a link to one.');
          return;
        }
        if (hasLink && !hasFile && !videoEmbed(form.url)) {
          setError('Paste a YouTube or Vimeo link — that one will not play.');
          return;
        }
      }
    }
    setBusy(true);
    setError('');
    try {
      const payload = form.kind !== 'video'
        ? { kind: form.kind, title: form.title, body: form.body }
        : form.dataUrl
          ? { kind: 'video', title: form.title, dataUrl: form.dataUrl }
          : form.url.trim()
            ? { kind: 'video', title: form.title, url: form.url }
            : { kind: 'video', title: form.title };
      if (dialog.mode === 'new') await adminApi.createResource(token, community.id, payload);
      else await adminApi.updateResource(token, dialog.resource.id, payload);
      setDialog(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (resource) => {
    if (!window.confirm(`Remove "${resource.title}"? This cannot be undone.`)) return;
    await adminApi.deleteResource(token, resource.id);
    await reload();
  };

  const show = async () => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { resources: true } });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const row = (resource) => (
    <div key={resource.id} className="card elev-sm" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="card-title" style={{ fontSize: 16 }}>{resource.title}</span>
        <span className="text-muted" style={{ flex: 'none', fontSize: 11.5 }}>
          {resource.kind === 'video' ? 'Video' : 'Article'}
        </span>
      </div>
      {resource.kind === 'article' && resource.body ? (
        <p className="card-body" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{resource.body}</p>
      ) : null}
      {resource.kind === 'video' ? (
        <span className="text-muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
          {resource.videoUrl
            ? `Uploaded file · ${megabytes(resource.sizeBytes)}`
            : resource.url}
        </span>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button" className="btn btn-ghost" onClick={() => openEdit(resource)}
          style={{ minHeight: 34, padding: '0 14px', fontSize: 12.5 }}
        >
          Edit
        </button>
        <button
          type="button" className="btn btn-danger" aria-label={`Delete ${resource.title}`}
          onClick={() => remove(resource)} style={{ minHeight: 34, padding: '0 12px' }}
        >
          <Trash />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
        Anything you want buyers to read or watch — how your build process works, what to
        expect at closing, a walkthrough. It shows <strong>below the tools</strong> in the
        buyer app, so it never gets in the way of the questions they came to answer.
      </p>

      {/*
        Writing something and having nobody see it is the failure worth catching
        here, the same way it was for the site map.
      */}
      {resources.length && !shown ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 10, background: 'var(--color-neutral-200)',
          }}
        >
          <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>
            Buyers are not seeing this — <strong>Videos &amp; articles</strong> is switched off under Tools.
          </span>
          <button
            type="button" className="btn btn-secondary" onClick={show}
            style={{ flex: 'none', minHeight: 34, padding: '0 14px', fontSize: 12.5 }}
          >
            Show it
          </button>
        </div>
      ) : null}

      {resources.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          Nothing here yet.
        </p>
      ) : null}

      {articles.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="text-muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Articles
          </span>
          {articles.map(row)}
        </div>
      ) : null}

      {videos.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="text-muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Videos · {videos.length} of {MAX_VIDEOS}
          </span>
          {videos.map(row)}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button" className="btn btn-primary" onClick={() => openNew('article')}
          style={{ flex: 1, minHeight: 46 }}
        >
          ＋ Write an article
        </button>
        <button
          type="button" className="btn btn-secondary" onClick={() => openNew('video')}
          disabled={roomForVideos <= 0} style={{ flex: 1, minHeight: 46 }}
        >
          {roomForVideos > 0 ? '＋ Add a video' : `${MAX_VIDEOS} videos is the limit`}
        </button>
      </div>

      {dialog ? (
        <Dialog
          title={`${dialog.mode === 'new' ? 'Add' : 'Edit'} ${dialog.kind === 'video' ? 'video' : 'article'}`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : dialog.mode === 'new' ? 'Add' : 'Save'}
              </button>
            </>
          }
        >
          <TextField
            label="Title" value={form.title}
            onChange={(title) => setForm((f) => ({ ...f, title }))}
            placeholder={dialog.kind === 'video' ? 'e.g. A walk through The Cedar' : 'e.g. What happens at closing'}
          />
          {dialog.kind === 'article' ? (
            <Field label="What you want them to know">
              <textarea
                className="input" rows={7} value={form.body}
                placeholder="Write as much as you like. Line breaks are kept."
                onChange={(event) => setForm((f) => ({ ...f, body: event.target.value }))}
              />
            </Field>
          ) : (
            <>
              <Field label="Video file">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  style={{
                    width: '100%', minHeight: 92, borderRadius: 12, cursor: 'pointer',
                    border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
                    padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 4, color: 'var(--color-ink)',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {reading ? 'Reading…' : form.fileName || 'Choose a video from this device'}
                  </span>
                  <span className="text-muted" style={{ fontSize: 11.5 }}>
                    {form.fileName ? 'Tap to pick a different one' : `MP4, WebM or MOV · up to ${megabytes(MAX_VIDEO_BYTES)}`}
                  </span>
                </button>
                <input
                  ref={fileInput} type="file" accept="video/*" hidden
                  onChange={pickVideo}
                />
              </Field>

              {form.dataUrl ? (
                <Field label="Preview">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={form.dataUrl}
                    controls
                    style={{ width: '100%', borderRadius: 12, background: '#000' }}
                  />
                </Field>
              ) : (
                <>
                  <span className="text-muted" style={{ fontSize: 12, textAlign: 'center' }}>
                    — or, for anything longer —
                  </span>
                  <TextField
                    label="YouTube or Vimeo link" value={form.url}
                    onChange={(url) => setForm((f) => ({ ...f, url }))}
                    placeholder="https://www.youtube.com/watch?v=…"
                    hint="Use this for a full tour. Nothing to upload and no size limit."
                  />
                  {videoEmbed(form.url) ? (
                    <Field label="Preview">
                      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden' }}>
                        <iframe
                          src={videoEmbed(form.url)}
                          title="Video preview"
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                        />
                      </div>
                    </Field>
                  ) : null}
                </>
              )}
            </>
          )}
          <ErrorNote>{error}</ErrorNote>
        </Dialog>
      ) : null}
    </div>
  );
}
