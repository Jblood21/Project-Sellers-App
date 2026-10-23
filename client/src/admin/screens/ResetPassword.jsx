import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { MIN_PASSWORD_LENGTH } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import AuthCard from './AuthCard.jsx';
import { ErrorNote, TextField } from '../ui.jsx';

const BAD_LINK = 'That link has expired or was already used. Ask for a new one.';

/**
 * The page the email's link opens: choose a new password, and be signed in with it. The token stays in
 * the address so a reload still works; the link is good once and for 30 minutes anyway. A link that is
 * missing, spent or stale gets one message and the way to ask for another.
 *
 * An invitation's link is the same link with `invite=1` after it, which only changes the words: the
 * person has no password yet, so they are setting one, not choosing a new one. The token is checked on
 * the server exactly as a reset link's is; the hint decides nothing there.
 */
export default function ResetPassword() {
  const { adoptSession } = useAdmin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invited = params.get('invite') === '1';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'form' until the server answers; then 'done', or 'bad' when the link is no good.
  const [state, setState] = useState(token ? 'form' : 'bad');

  const submit = async (event) => {
    event.preventDefault();
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
      adoptSession(await adminApi.resetPassword(token, password));
      setState('done');
    } catch (err) {
      // The server's one sentence for a bad link; anything else (a weak password, too many tries) is shown in place.
      if (err.status === 400 && err.message === BAD_LINK) setState('bad');
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'bad') {
    return (
      <AuthCard
        title="This link will not work"
        blurb={invited ? `${BAD_LINK} Or ask whoever invited you to send the invite again.` : BAD_LINK}
        focusTitle
      >
        <Link to="/admin/forgot" className="btn btn-primary btn-block" style={{ marginTop: 6, minHeight: 46 }}>Ask for a new link</Link>
        <Link to="/admin" className="btn btn-link btn-block" style={{ fontSize: 14 }}>Back to sign in</Link>
      </AuthCard>
    );
  }

  if (state === 'done') {
    return (
      <AuthCard
        title="Signed in"
        blurb={invited
          ? 'Your password is set. Sign in with it from now on, on any device.'
          : 'Your new password is set, and anyone signed in with the old one has been signed out.'}
      >
        <button
          type="button" className="btn btn-primary btn-block" style={{ marginTop: 6, minHeight: 46 }} autoFocus
          onClick={() => navigate('/admin', { replace: true })}
        >
          Go to Today
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={invited ? 'Set your password' : 'Choose a new password'}
      blurb={invited
        ? 'You have been invited to the Touradoor admin. Choose a password and you will be signed in with it straight away.'
        : 'You will be signed in with it straight away.'}
      onSubmit={submit}
    >
      <TextField
        label={invited ? 'Password' : 'New password'} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} value={password}
        onChange={setPassword} type="password" autoComplete="new-password" autoFocus
      />
      <TextField
        label={invited ? 'Password again' : 'New password again'} value={confirm} onChange={setConfirm} type="password"
        autoComplete="new-password"
      />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
        {busy ? 'Saving…' : 'Set password and sign in'}
      </button>
    </AuthCard>
  );
}
