import React, { useState } from 'react';
import { LockKeyhole, BrainCircuit, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/apiError';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(formatApiError(err, 'Unable to sign in. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
    background: 'radial-gradient(circle at 15% 15%, rgba(59,130,246,.17), transparent 34%), var(--bg-color)' }}>
    <section style={{ width: 'min(100%, 430px)', padding: '2.4rem', border: '1px solid var(--border-color)',
      borderRadius: 20, background: 'var(--sidebar-bg)', boxShadow: '0 22px 70px rgba(15,23,42,.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
        <BrainCircuit size={28} color="var(--primary)" />
        <strong style={{ fontSize: 20, color: 'var(--text-main)' }}>FB <span style={{ color: 'var(--primary)' }}>Sentiments</span></strong>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: 26 }}>Welcome back</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Sign in to your Facebook analytics workspace.</p>
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <label style={{ display: 'grid', gap: 7, color: 'var(--text-main)', fontSize: 14, fontWeight: 600 }}>
          Username
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={64}
            style={{ padding: '12px 14px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)' }} />
        </label>
        <label style={{ display: 'grid', gap: 7, color: 'var(--text-main)', fontSize: 14, fontWeight: 600 }}>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
            style={{ padding: '12px 14px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)' }} />
        </label>
        {error && <div role="alert" style={{ color: 'var(--error)', fontSize: 14 }}>{error}</div>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ minHeight: 45, justifyContent: 'center', marginTop: 4 }}>
          {busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={16} />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ margin: '22px 0 0', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
        Application sign-in is separate from your Facebook Graph API connection.
      </p>
    </section>
  </main>;
}
