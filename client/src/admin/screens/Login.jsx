import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAdmin } from '../AdminContext.jsx';
import AuthCard from './AuthCard.jsx';
import { ErrorNote, TextField } from '../ui.jsx';

export default function Login() {
  const { signIn, sessionEnded } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // When the app itself put this form up (the server refused the session this tab held), the line under
  // the heading says so, and the heading takes the keyboard so the reason is read out.
  const blurb = sessionEnded
    ? 'You were signed out: the password changed, your access was removed, or two weeks had passed. Sign in again.'
    : 'Manage your communities, homes, buyer tools and leads.';

  return (
    <AuthCard title="Sign in" blurb={blurb} onSubmit={submit} focusTitle={sessionEnded}>
      <TextField label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
      <TextField
        label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password"
      />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <Link to="/admin/forgot" className="btn btn-link btn-block" style={{ fontSize: 14 }}>Forgot your password?</Link>
    </AuthCard>
  );
}
