import { BackendError, requestJson } from './http';
import type { Env } from './types';

export type CurrentQuote = {
  price: number; bid: number; ask: number; time: string; fetchedAt: string;
  source: 'OANDA'; basis: 'bid/ask midpoint'; status: 'current' | 'stale' | 'market_closed';
  instrument: 'XAU_USD'; cached?: boolean;
};
export async function currentQuote(env: Env): Promise<CurrentQuote> {
  if (!env.OANDA_API_TOKEN || !env.OANDA_ACCOUNT_ID) throw new BackendError('QUOTE_NOT_CONFIGURED');
  if (!['practice', 'live'].includes(env.OANDA_ENV ?? 'practice')) throw new BackendError('INVALID_OANDA_ENV');
  const host = env.OANDA_ENV === 'live' ? 'api-fxtrade.oanda.com' : 'api-fxpractice.oanda.com';
  const result = await requestJson<{ prices: { instrument: string; time: string; status: string; bids: { price: string }[]; asks: { price: string }[] }[] }>(
    `https://${host}/v3/accounts/${encodeURIComponent(env.OANDA_ACCOUNT_ID)}/pricing?instruments=XAU_USD`,
    { headers: { Authorization: `Bearer ${env.OANDA_API_TOKEN}`, 'Accept-Datetime-Format': 'RFC3339' } }, 2);
  const p = result.prices?.find(p => p.instrument === 'XAU_USD');
  const bid = Number(p?.bids?.[0]?.price), ask = Number(p?.asks?.[0]?.price);
  const age = Date.now() - Date.parse(p?.time ?? '');
  if (!(bid > 0 && ask >= bid) || !Number.isFinite(ask) || !Number.isFinite(age) || age < -5000) throw new BackendError('INVALID_QUOTE');
  return { price: (bid + ask) / 2, bid, ask, time: p!.time, fetchedAt: new Date().toISOString(), source: 'OANDA', basis: 'bid/ask midpoint',
    status: p!.status !== 'tradeable' ? 'market_closed' : age > 120000 ? 'stale' : 'current', instrument: 'XAU_USD' };
}
