"use client";
import { useEffect, useState, type FormEvent } from 'react';
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'session') setError('Your session expired or access changed. Sign in to continue.');
  }, []);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      if (!r.ok) {
        setError(r.status === 403 ? 'This account is not approved for Gold Quant.' : 'Sign-in failed. Check your email and password.');
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next') ?? '/';
      window.location.assign(next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.startsWith('/login') ? next : '/');
    } catch { setError('Sign-in is unavailable. Please retry.'); }
    finally { (form.elements.namedItem('password') as HTMLInputElement).value = ''; setBusy(false); }
  }
  return <><nav><b>Gold Quant</b><div className="s">XAU/USD</div></nav><main><section><div className="card" style={{ maxWidth: 440 }}>
    <h2>Sign in to Gold Quant</h2><p className="mut">Private market dashboard</p>
    <form onSubmit={signIn}>
      <label className="f">Email<input name="email" type="email" autoComplete="username" required style={{ width: '70%' }} /></label>
      <label className="f">Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} style={{ width: '70%' }} /></label>
      <button className="go" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {error && <p className="dn" role="alert">{error}</p>}
    </form></div></section></main></>;
}
