import { useState } from 'react';
import { Link } from 'react-router-dom';

import { adminApi } from '../../lib/api.js';
import AuthCard from './AuthCard.jsx';
import { ErrorNote, TextField } from '../ui.jsx';

/**
 * Asks for the account's email and has the server send a link that sets a new password. The server's
 * answer is the same sentence whether or not the address has an account, and it is shown as it comes.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await adminApi.forgotPassword(email.trim());
      setSent(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthCard title="Check your email" blurb={sent} focusTitle>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
          Nothing there after a few minutes? Check the spam folder, or try again.
        </p>
        <Link to="/admin" className="btn btn-secondary btn-block" style={{ marginTop: 6, minHeight: 46 }}>Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      blurb="Enter the email you sign in with and we will send a link that lets you choose a new one."
      onSubmit={submit}
    >
      <TextField label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" autoFocus />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <Link to="/admin" className="btn btn-link btn-block" style={{ fontSize: 14 }}>Back to sign in</Link>
    </AuthCard>
  );
}
