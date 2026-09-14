import { useState } from 'react';

import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, TextField } from '../ui.jsx';

export default function Login() {
  const { signIn } = useAdmin();
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form className="card elev-sm" onSubmit={submit} style={{ width: '100%', maxWidth: 380, gap: 14, padding: 24 }}>
        <span className="card-kicker">Builder / agent admin</span>
        <h2 style={{ margin: '2px 0 4px', fontSize: 24 }}>Sign in</h2>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
          Manage your communities, homes, buyer tools and leads.
        </p>
        <TextField label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
        <TextField
          label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password"
        />
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
