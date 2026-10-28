import { afterEach, expect, it, vi } from 'vitest';
import { intraday } from '../src/lib/backend/intraday';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
it('uses real M15 midpoint closes in the last 24 hours and excludes incomplete candles',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  const u=new URL(url);expect(u.searchParams.get('granularity')).toBe('M15');expect(u.searchParams.get('from')).toBe('2026-10-27T12:00:00.000Z');
  return Response.json({instrument:'XAU_USD',granularity:'M15',candles:[{time:'2026-10-28T11:00:00Z',complete:true,mid:{c:'4000'}},{time:'2026-10-28T11:15:00Z',complete:true,mid:{c:'4001'}},{time:'2026-10-28T11:45:00Z',complete:false,mid:{c:'9999'}}]});
 }));const r=await intraday({OANDA_API_TOKEN:'fixture'});expect(r.points).toEqual([{time:'2026-10-28T11:15:00.000Z',price:4000},{time:'2026-10-28T11:30:00.000Z',price:4001}]);
});
it('returns unavailable for a closed-market empty intraday sample',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({instrument:'XAU_USD',granularity:'M15',candles:[]})));await expect(intraday({OANDA_API_TOKEN:'fixture'})).rejects.toThrow('INTRADAY_UNAVAILABLE');
});
