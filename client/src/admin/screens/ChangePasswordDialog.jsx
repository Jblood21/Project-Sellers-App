import { useEffect, useId, useRef, useState } from 'react';

import { MIN_PASSWORD_LENGTH } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, ErrorNote, TextField } from '../ui.jsx';

/**
 * A new password, chosen while signed in. The current one is asked for again (a tab left open is not
 * enough to change it), and the server answers with a fresh session for this tab: every other one, on
 * any other device, ends on its next request.
 */
export default function ChangePasswordDialog({ onClose }) {
  const { token, adoptSession } = useAdmin();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const outcomeId = useId();
  // The form that had the keyboard is gone once the change lands, so Done takes it (Enter closes),
  // described by the outcome, which is how a screen reader hears what happened. Moved here, not with
  // autoFocus: React keeps the Cancel button's element for Done (same type, no key), so Done never mounts.
  const doneButton = useRef(null);
  useEffect(() => {
    if (done) doneButton.current?.focus();
  }, [done]);

  const save = async (event) => {
    event?.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      adoptSession(await adminApi.changePassword(token, current, password));
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Dialog
        title="Password changed"
        onClose={onClose}
        actions={<button ref={doneButton} type="button" className="btn btn-primary" onClick={onClose} aria-describedby={outcomeId}>Done</button>}
      >
        <p id={outcomeId} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          You stay signed in here. Anyone signed in on another device with the old password has been signed out.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Change password"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="change-password" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </>
      }
    >
      {/* A form, so Enter in any field saves; the submit button sits in the dialog's actions and names it. */}
      <form id="change-password" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField
          label="Current password" value={current} onChange={setCurrent} type="password" autoComplete="current-password"
        />
        <TextField
          label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} value={password} onChange={setPassword}
          type="password" autoComplete="new-password"
        />
        <TextField
          label="New password again" value={confirm} onChange={setConfirm} type="password" autoComplete="new-password"
        />
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Dialog>
  );
}
