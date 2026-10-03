import { useRef, useState } from 'react';

import { Trash } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, ErrorNote, TextField, Toggle } from '../ui.jsx';
import GuideEditor from './GuideEditor.jsx';

/**
 * The buyer guides: the long how-to articles on the buyer app's Guides page.
 *
 * Every community starts with the supplied set. Deleting one is permanent until
 * "Restore the supplied guides" brings it back, and that never overwrites a guide
 * the builder has edited, so restoring is always safe to press.
 */
export default function GuidesSection({ community, reload }) {
  const { token } = useAdmin();
  const [editing, setEditing] = useState(null); // a guide id
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busyId, setBusyId] = useState('');
  const [working, setWorking] = useState(false);
  // State is not read back until the next render, so a second Enter that arrives
  // first would still see `working` as false. The ref closes that gap.
  const creating = useRef(false);
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [restoreNote, setRestoreNote] = useState('');

  const guides = community.guides ?? [];
  const live = guides.filter((guide) => guide.published).length;
  const shown = Boolean(community.features?.guides);

  const guard = async (id, work) => {
    setBusyId(id);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const togglePublished = (guide, published) =>
    guard(guide.id, async () => {
      await adminApi.updateGuide(token, guide.id, { published });
      await reload();
    });

  const remove = (guide) => {
    if (!window.confirm(`Delete "${guide.title}"? Buyers lose it at once. You can bring back a supplied guide with Restore, but nothing you wrote in it.`)) return;
    return guard(guide.id, async () => {
      await adminApi.deleteGuide(token, guide.id);
      await reload();
    });
  };

  const create = async () => {
    if (creating.current) return;
    if (!title.trim()) return setDialogError('Give the guide a title.');
    creating.current = true;
    setWorking(true);
    setDialogError('');
    try {
      const created = await adminApi.createGuide(token, community.id, { title });
      await reload();
      setAdding(false);
      setTitle('');
      // Straight into the editor: a guide with a title and nothing else is not finished.
      setEditing(created.id);
    } catch (err) {
      setDialogError(err.message);
    } finally {
      creating.current = false;
      setWorking(false);
    }
  };

  const restore = async () => {
    setWorking(true);
    setError('');
    setRestoreNote('');
    try {
      const result = await adminApi.restoreGuides(token, community.id);
      await reload();
      setRestoreNote(result.restored
        ? `Restored ${result.restored} supplied ${result.restored === 1 ? 'guide' : 'guides'}. Guides you already have were left as they are.`
        : 'Nothing to restore. Every supplied guide is already here.');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const show = async () => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { guides: true } });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section aria-labelledby="learn-guides" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h4 id="learn-guides" style={{ margin: 0, fontSize: 17 }}>Buyer guides</h4>
        <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '4px 0 0' }}>
          Long-form articles buyers can read before they share their details, such as what a mortgage
          costs or what closing involves. {guides.length
            ? `${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}, ${live} published.`
            : 'None yet.'}
        </p>
      </div>

      {guides.length && !shown ? (
        <div className="ax-callout">
          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            Buyers are not seeing these guides. <strong>Buyer guides</strong> is switched off under Tools.
          </span>
          <button type="button" className="btn btn-secondary" onClick={show} style={{ alignSelf: 'flex-start', minHeight: 44 }}>
            Show them
          </button>
        </div>
      ) : null}

      {guides.map((guide) => (
        <div key={guide.id} className="card elev-sm ax-guide-row">
          <div className="ax-guide-main">
            <span className="card-title" style={{ fontSize: 15.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{guide.title}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {guide.category}
              {guide.published ? '' : ' · Hidden from buyers'}
            </span>
          </div>
          <div className="ax-guide-controls">
            <span className="ax-guide-toggle">
              <Toggle
                on={guide.published}
                label={`${guide.title} published`}
                onChange={(next) => busyId !== guide.id && togglePublished(guide, next)}
              />
              <span>{guide.published ? 'Published' : 'Draft'}</span>
            </span>
            <button
              type="button" className="btn btn-ghost" onClick={() => setEditing(guide.id)}
              aria-label={`Edit ${guide.title}`} disabled={busyId === guide.id}
            >
              Edit
            </button>
            <button
              type="button" className="btn btn-danger" aria-label={`Delete ${guide.title}`}
              onClick={() => remove(guide)} disabled={busyId === guide.id}
            >
              <Trash />
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button" className="btn btn-primary" style={{ flex: '1 1 160px', minHeight: 46 }}
          onClick={() => {
            setDialogError('');
            setAdding(true);
          }}
        >
          ＋ Add a guide
        </button>
        <button
          type="button" className="btn btn-secondary" style={{ flex: '1 1 160px', minHeight: 46 }}
          onClick={restore} disabled={working}
        >
          Restore the supplied guides
        </button>
      </div>
      {restoreNote ? <p className="ax-status" role="status" style={{ margin: 0 }}>{restoreNote}</p> : null}
      <ErrorNote>{error}</ErrorNote>

      {adding ? (
        <Dialog
          title="Add a guide"
          onClose={() => setAdding(false)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={create} disabled={working}>
                {working ? 'Adding…' : 'Add and edit'}
              </button>
            </>
          }
        >
          <TextField
            label="Title" value={title} onChange={setTitle} maxLength={140}
            placeholder="e.g. What to expect at your final walkthrough"
            hint="You will write the text, add a picture and publish it in the next step."
            onKeyDown={(event) => event.key === 'Enter' && !event.repeat && create()}
          />
          <ErrorNote>{dialogError}</ErrorNote>
        </Dialog>
      ) : null}

      {editing ? (
        <GuideEditor
          key={editing}
          community={community}
          guideId={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </section>
  );
}
