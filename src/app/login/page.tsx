"use client";
import { useEffect, useState, type FormEvent } from 'react';
import styles from './login.module.css';
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
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
      const target = new URL(next, window.location.origin);
      window.location.assign(target.origin === window.location.origin && !target.pathname.startsWith('/login') && !target.pathname.startsWith('/api/') ? target.pathname + target.search + target.hash : '/');
    } catch { setError('Sign-in is unavailable. Please retry.'); }
    finally { (form.elements.namedItem('password') as HTMLInputElement).value = ''; setBusy(false); }
  }
  return <div className={styles.page}>
    <header className={styles.brand}>DEPLYZE <span>QE</span></header>
    <div className={styles.visual} aria-hidden="true">
      <div className={styles.orbs} />
      <span className={styles.caption}>A clearer perspective.</span>
    </div>
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.heading}>
          <h1 id="login-title">{creating ? 'Create an account' : 'Log in'}</h1>
          <p>or{' '}
            <button type="button" className={styles.textButton} disabled={busy} onClick={() => {
              setCreating(!creating); setNotice(''); setError(''); setShowPassword(false);
            }}>{creating ? 'log in to your account' : 'create an account'}</button>
          </p>
        </div>
        <form className={styles.form} onSubmit={creating ? event => event.preventDefault() : signIn} aria-busy={busy}>
          {creating && <label className={styles.field}>
            <span>Username</span><input name="username" autoComplete="username" placeholder="Your name" required disabled={busy} />
          </label>}
          <label className={styles.field}>
            <span>Email</span><input name="email" type="email" autoComplete={creating ? 'email' : 'username'} placeholder="you@example.com" required maxLength={254} disabled={busy} />
          </label>
          <label className={`${styles.field} ${styles.password}`}>
            <span>Password</span><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} placeholder="Enter your password" required maxLength={1024} disabled={busy} />
            <button className={styles.reveal} type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{!showPassword && <path d="m3 3 18 18" />}</svg>
            </button>
          </label>
          <button className={styles.enter} type="submit" disabled={busy || creating}>{creating ? 'Create account' : busy ? 'Signing in…' : 'Enter'}</button>
          {creating && <p className={styles.message}>Account creation is not available yet. Access is by approval only.</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
        {!creating && <button type="button" className={`${styles.textButton} ${styles.forgot}`} onClick={() => setNotice('To reset your password, contact your account administrator.')}>Forgot password?</button>}
        <div className={styles.divider}><span>or</span></div>
        <button type="button" className={styles.google} disabled={busy} onClick={() => setNotice('Google sign-in is not available yet. Use your approved email and password.')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.83-1.76-5.62-4.12H3.04v2.59A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.38 13.92a6 6 0 0 1 0-3.84V7.49H3.04a10 10 0 0 0 0 9.02l3.34-2.59Z" /><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.88-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.34 2.59C7.17 7.72 9.39 5.96 12 5.96Z" /></svg>
          Sign in with Google
        </button>
        <p className={styles.notice} role="status">{notice}</p>
      </section>
    </main>
    <footer className={styles.footer}>Gold Quant <span>Private access</span></footer>
  </div>;
}
