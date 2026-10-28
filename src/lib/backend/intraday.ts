import { BackendError, requestJson } from './http';
import type { Env } from './types';
import type { OandaResponse } from './normalizers';

export async function intraday(env: Env) {
  if (!env.OANDA_API_TOKEN) throw new BackendError('OANDA_NOT_CONFIGURED');
  if (!['practice', 'live'].includes(env.OANDA_ENV ?? 'practice')) throw new BackendError('INVALID_OANDA_ENV');
  const now = Date.now(), host = env.OANDA_ENV === 'live' ? 'api-fxtrade.oanda.com' : 'api-fxpractice.oanda.com';
  const params = new URLSearchParams({ price: 'M', granularity: 'M15', from: new Date(now - 86400000).toISOString(), to: new Date(now - 5000).toISOString(), smooth: 'false' });
  const p = await requestJson<OandaResponse>(`https://${host}/v3/instruments/XAU_USD/candles?${params}`, { headers: { Authorization: `Bearer ${env.OANDA_API_TOKEN}` } }, 2);
  if (p.instrument !== 'XAU_USD' || p.granularity !== 'M15' || !Array.isArray(p.candles)) throw new BackendError('INVALID_INTRADAY');
  const points = p.candles.filter(c => c.complete).map(c => ({ time: new Date(Date.parse(c.time) + 900000).toISOString(), price: Number(c.mid.c) }));
  if (points.some((p, i) => !(p.price > 0) || !Number.isFinite(p.price) || Date.parse(p.time) > now || (i > 0 && p.time <= points[i - 1].time))) throw new BackendError('INVALID_INTRADAY');
  if (points.length < 2) throw new BackendError('INTRADAY_UNAVAILABLE');
  return { points, fetchedAt: new Date().toISOString(), source: 'OANDA', basis: 'completed M15 midpoint', cacheSeconds: 60 };
}
