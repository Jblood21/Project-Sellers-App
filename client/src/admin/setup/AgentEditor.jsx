import { useEffect, useState } from 'react';

import { AGENT_TEXT_MAX, agentLicenseLine } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, TextField } from '../ui.jsx';
import ImageSlot from './ImageSlot.jsx';
import { logoToDataUrl } from './readImage.js';

const BLANK = {
  name: '', brokerage: '', licenseState: 'UT', licenseNo: '', phone: '', email: '', website: '',
};

/** The editable text of an agent, nothing else, so comparing it means something. */
const textOf = (agent) => Object.fromEntries(
  Object.keys(BLANK).map((key) => [key, agent?.[key] ?? BLANK[key]]),
);

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/**
 * One realtor, either saved (`agent`) or a draft being added (`agent` null).
 *
 * Saved realtors persist through the agents API, not the page's Save settings
 * button: their own Save button, and each picture the moment it finishes
 * uploading. A draft has no id to attach pictures to yet, so it holds them and
 * sends them right after the realtor is created.
 */
export default function AgentEditor({ agent, index, community, reload, onClose, onCreated }) {
  const { token } = useAdmin();
  const draft = !agent;
  const [open, setOpen] = useState(draft);
  const [form, setForm] = useState(() => textOf(agent));
  const [pending, setPending] = useState({ photo: null, logo: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  // Pictures uploading must not wipe what is half-typed, so the form only
  // re-syncs when the saved text itself changes (a save, or another tab).
  const serverText = JSON.stringify(textOf(agent));
  useEffect(() => {
    if (!draft) setForm(JSON.parse(serverText));
  }, [draft, serverText]);

  const dirty = draft || JSON.stringify(form) !== serverText;
  const set = (key) => (value) => {
    setSavedAt(0);
    setForm((prev) => ({
      ...prev,
      [key]: key === 'licenseState' ? value.replace(/[^a-z]/gi, '').toUpperCase() : value,
    }));
  };

  const validate = () => {
    if (!form.name.trim()) return 'Add the realtor’s name.';
    if (form.email.trim() && !form.email.includes('@')) return 'That email address needs an @ in it.';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setBusy('save');
    setError('');
    try {
      if (draft) {
        const created = await adminApi.createAgent(token, community.id, form);
        const failed = [];
        // Each picture is its own request, so one failing does not lose the other
        // and the realtor is never left half-created without the builder knowing.
        for (const [label, send, dataUrl] of [
          ['photo', adminApi.setAgentPhoto, pending.photo],
          ['logo', adminApi.setAgentLogo, pending.logo],
        ]) {
          if (!dataUrl) continue;
          try {
            await send(token, created.id, { dataUrl });
          } catch (err) {
            failed.push(`the ${label} (${err.message})`);
          }
        }
        await reload();
        onCreated(failed.length
          ? `${created.name} was added, but ${failed.join(' and ')} did not upload. Open Edit to try again.`
          : '');
      } else {
        await adminApi.updateAgent(token, agent.id, form);
        await reload();
        setSavedAt(Date.now());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${agent.name}? Their photo and logo are deleted too. This cannot be undone.`)) return;
    setBusy('remove');
    setError('');
    try {
      await adminApi.deleteAgent(token, agent.id);
      await reload();
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const upload = (send) => async (dataUrl) => {
    await send(token, agent.id, { dataUrl });
    await reload();
  };
  const discard = (image) => async () => {
    await adminApi.deletePhoto(token, image.id);
    await reload();
  };

  const title = draft ? 'New realtor' : agent.name;
  const license = draft ? '' : agentLicenseLine(agent);
  const label = draft ? 'New realtor' : `Realtor ${index + 1}: ${agent.name}`;

  return (
    <div className="card elev-sm" role="group" aria-label={label} style={{ gap: 12, background: '#fff' }}>
      <div className="ax-agent-head">
        <div className="ax-agent-thumb" aria-hidden="true">
          {(draft ? pending.photo : agent.photo?.url)
            ? <img src={draft ? pending.photo : agent.photo.url} alt="" />
            : initials(form.name)}
        </div>
        <div className="ax-agent-meta">
          <span className="card-title" style={{ fontSize: 15 }}>{title}</span>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {draft ? 'Fill this in, then add them.' : [agent.brokerage, license].filter(Boolean).join(' · ') || 'No brokerage yet'}
          </span>
        </div>
        {!draft && dirty ? <span className="tag tag-accent">Unsaved</span> : null}
        {!draft ? (
          <button
            type="button" className="btn btn-secondary" aria-expanded={open} onClick={() => setOpen(!open)}
            aria-label={`${open ? 'Close' : 'Edit'} ${agent.name}`} style={{ minHeight: 44 }}
          >
            {open ? 'Close' : 'Edit'}
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="ax-cols">
            <TextField label="Name" value={form.name} onChange={set('name')} maxLength={AGENT_TEXT_MAX.name} autoComplete="off" />
            <TextField label="Brokerage" value={form.brokerage} onChange={set('brokerage')} maxLength={AGENT_TEXT_MAX.brokerage} autoComplete="off" />
            <TextField
              label="License state" value={form.licenseState} onChange={set('licenseState')}
              maxLength={AGENT_TEXT_MAX.licenseState} autoCapitalize="characters" autoComplete="off"
              hint="Two letters, such as UT."
            />
            <TextField label="License number" value={form.licenseNo} onChange={set('licenseNo')} maxLength={AGENT_TEXT_MAX.licenseNo} autoComplete="off" />
            <TextField label="Phone" value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={AGENT_TEXT_MAX.phone} autoComplete="off" />
            <TextField label="Email" value={form.email} onChange={set('email')} inputMode="email" maxLength={AGENT_TEXT_MAX.email} autoComplete="off" />
            <div style={{ gridColumn: '1 / -1' }}>
              <TextField
                label="Website" value={form.website} onChange={set('website')} inputMode="url"
                maxLength={AGENT_TEXT_MAX.website} placeholder="https://…" autoComplete="off"
                hint="Only web addresses starting with http:// or https:// are kept."
              />
            </div>
          </div>

          <ImageSlot
            label="Agent photo"
            shape="square"
            image={draft ? pending.photo : agent.photo?.url ?? null}
            alt={draft ? 'Agent photo ready to upload' : `${agent.name} photo as saved`}
            pending={draft}
            onPick={draft ? async (dataUrl) => setPending((p) => ({ ...p, photo: dataUrl })) : upload(adminApi.setAgentPhoto)}
            onRemove={draft ? async () => setPending((p) => ({ ...p, photo: null })) : discard(agent.photo ?? {})}
            removeWarning={draft ? 'Remove the picked photo?' : `Remove ${agent?.name}’s photo?`}
            hint="A head-and-shoulders portrait. It is cropped to fill a square."
          />
          <ImageSlot
            label="Agent logo"
            image={draft ? pending.logo : agent.logo?.url ?? null}
            alt={draft ? 'Agent logo ready to upload' : `${agent.name} logo as saved`}
            pending={draft}
            read={logoToDataUrl}
            onPick={draft ? async (dataUrl) => setPending((p) => ({ ...p, logo: dataUrl })) : upload(adminApi.setAgentLogo)}
            onRemove={draft ? async () => setPending((p) => ({ ...p, logo: null })) : discard(agent.logo ?? {})}
            removeWarning={draft ? 'Remove the picked logo?' : `Remove ${agent?.name}’s logo?`}
            hint="Their own or their brokerage's logo. PNG, WebP, JPEG or GIF up to 3 MB; no SVG."
          />

          <ErrorNote>{error}</ErrorNote>
          <div className="ax-actions">
            {draft ? (
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={Boolean(busy)}>Cancel</button>
            ) : (
              <button
                type="button" className="btn btn-danger" onClick={remove} disabled={Boolean(busy)}
                aria-label={`Remove ${agent.name}`} style={{ marginRight: 'auto' }}
              >
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </button>
            )}
            {savedAt ? <span className="ax-status" role="status" style={{ alignSelf: 'center' }}>Saved.</span> : null}
            <button
              type="button" className="btn btn-primary" onClick={save}
              disabled={Boolean(busy) || (!draft && !dirty)}
              aria-label={draft ? 'Add this realtor' : `Save ${agent.name}`}
            >
              {busy === 'save' ? 'Saving…' : draft ? 'Add realtor' : 'Save realtor'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
