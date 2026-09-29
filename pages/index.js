import { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        window.location.href = '/home.html';
        return;
      }
      if (res.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else {
        setError('Incorrect username or password');
      }
    } catch (e) {
      setError('Could not reach the server. Try again.');
    }
    setBusy(false);
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={onSubmit}>
        <img
          src="https://terratern.com/images/favicon_192.png"
          alt="TerraTern"
          style={styles.logo}
        />
        <div style={styles.title}>Marketing CRM</div>
        <div style={styles.sub}>Sign in to continue</div>

        <input
          style={styles.input}
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error ? <div style={styles.error}>{error}</div> : null}

        <button style={styles.btn} type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f7fc',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  card: {
    background: '#fff',
    border: '1px solid #dde6f5',
    borderRadius: 16,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 340,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 8px 24px rgba(0,33,92,0.08)',
  },
  logo: { width: 48, height: 48, borderRadius: 10, marginBottom: 14 },
  title: { fontSize: '1.15rem', fontWeight: 800, color: '#00215C' },
  sub: { fontSize: '0.85rem', color: '#5a7ab5', marginBottom: 22 },
  input: {
    width: '100%',
    padding: '11px 14px',
    marginBottom: 12,
    border: '1.5px solid #dde6f5',
    borderRadius: 9,
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.8rem',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  btn: {
    width: '100%',
    padding: '12px',
    marginTop: 4,
    background: '#00215C',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.9rem',
    border: 'none',
    borderRadius: 9,
    cursor: 'pointer',
  },
};
