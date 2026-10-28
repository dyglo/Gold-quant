"use client";
import { useEffect, useState, type FormEvent } from 'react';
import Markup from './Markup';
import { mount } from '@/lib/legacy/app';
import { loadSeries, SeriesUnavailable, type Loaded } from '@/lib/data/provider';

type Quote = { price: number; closeAt: string; source: string; label: string };
type Screen = { kind: 'loading' } | { kind: 'ready'; loaded: Loaded } | { kind: 'signin'; forbidden: boolean } | { kind: 'unavailable'; code: string; quote?: Quote };
const messages: Record<string, string> = {
  INSUFFICIENT_POINT_IN_TIME_HISTORY: 'Charts and backtests need at least 200 eligible daily bars. Historical availability has not yet been established for this sample.',
  STALE_REQUIRED_SERIES: 'A required research series is stale. Refresh ingestion before using the analysis.',
  STALE_BAR: 'The stored research bars are stale. Refresh ingestion before using the analysis.',
  CONNECTION_FAILED: 'The market-data service could not be reached. Please retry.',
  DATABASE_UNAVAILABLE: 'The market-data database is unavailable. Please retry.',
};

async function screen(): Promise<Screen> {
  try { return { kind: 'ready', loaded: await loadSeries() }; }
  catch (error) {
    if (error instanceof SeriesUnavailable && (error.status === 401 || error.status === 403)) return { kind: 'signin', forbidden: error.status === 403 };
    let quote: Quote | undefined;
    try {
      const response = await fetch('/api/quote', { cache: 'no-store' });
      const body = await response.json();
      if (response.ok && Number.isFinite(body.price) && body.price > 0) quote = body;
    } catch { /* Missing data stays unavailable. Never generate a sample. */ }
    return { kind: 'unavailable', code: error instanceof SeriesUnavailable ? error.code : 'DATA_UNAVAILABLE', quote };
  }
}

export default function Dashboard() {
  const [state, setState] = useState<Screen>({ kind: 'loading' });
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  useEffect(() => { let active = true; screen().then(value => { if (active) setState(value); }); return () => { active = false; }; }, []);
  useEffect(() => { if (state.kind === 'ready') mount({ load: async () => state.loaded }); }, [state]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSigningIn(true); setSignInError('');
    try {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSignInError(body?.error === 'FORBIDDEN' ? 'This account is not approved for Gold Quant.' : 'Sign-in failed. Use your Goldquant app account, not your Supabase dashboard password.');
        return;
      }
      window.location.reload();
    } catch { setSignInError('The sign-in service could not be reached. Please retry.'); }
    finally { (form.elements.namedItem('password') as HTMLInputElement).value = ''; setSigningIn(false); }
  }

  if (state.kind === 'ready') return <Markup />;
  const quote = state.kind === 'unavailable' ? state.quote : undefined;
  return <>
    <nav><b>Gold Quant</b><div className="s">XAU/USD</div><span className="bdg" role="status">{state.kind === 'loading' ? 'Connecting…' : state.kind === 'signin' ? 'Sign in required' : quote ? 'Real daily close · OANDA' : 'Market data unavailable'}</span><button className="btn" onClick={() => window.location.reload()}>Refresh</button></nav>
    <main><section>
      {state.kind === 'loading' && <p className="mut" role="status">Connecting to the market-data service…</p>}
      {state.kind === 'signin' && <div className="card" style={{ maxWidth: 440 }}>
        <h2>Sign in to Gold Quant</h2>
        <p className="mut">Use the app account created in the Goldquant project’s Authentication settings.</p>
        {state.forbidden && <p className="dn">Your current account is not approved for this app.</p>}
        <form onSubmit={signIn}>
          <label className="f">Email<input name="email" type="email" autoComplete="username" required style={{ width: '70%' }} /></label>
          <label className="f">Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} style={{ width: '70%' }} /></label>
          <button type="submit" className="go" disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</button>
          {signInError && <p className="dn" role="alert">{signInError}</p>}
        </form>
      </div>}
      {state.kind === 'unavailable' && <>
        {quote && <><p className="mut">XAU/USD · {quote.label}</p><h1>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.price)}</h1><p className="mut">{quote.source} · {new Date(quote.closeAt).toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })}</p></>}
        <div className="card"><h2>{quote ? 'Research history unavailable' : 'Market data unavailable'}</h2><p className="mut" role="status">{messages[state.code] ?? 'The market-data service cannot provide an eligible sample right now. Check data health and ingestion.'}</p><p className="note">{quote ? 'This is a stored completed daily close, not a streaming quote. No charts, signals or backtests are computed from incomplete history.' : 'No price or trading signal is displayed until real market data is available.'}</p></div>
      </>}
    </section></main>
  </>;
}
