import { useState } from 'react';
import { Link } from 'react-router-dom';

import { MIN_PASSWORD_LENGTH } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import AuthCard from './AuthCard.jsx';
import { ErrorNote, TextField } from '../ui.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A real estate agent makes their own account, with the access code the owner gave them. They are signed in at
 * once and land on an empty Today whose first button is "New listing": what they make is all they see.
 */
export default function AgentSignup() {
  const { adoptSession } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError('Type a real email address.');
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (!code.trim()) return setError('Type the access code you were given.');
    setBusy(true);
    setError('');
    try {
      adoptSession(await adminApi.signup(email.trim(), password, code.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your agent account"
      blurb="Keep your listings and open houses in one place. You will see only the homes you add."
      onSubmit={submit}
    >
      <TextField label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
      <TextField
        label="Choose a password" value={password} onChange={setPassword} type="password" autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <TextField label="Access code" value={code} onChange={setCode} autoComplete="off" hint="From the person who invited you." />
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <Link to="/admin" className="btn btn-link btn-block" style={{ fontSize: 14 }}>I already have an account</Link>
    </AuthCard>
  );
}
