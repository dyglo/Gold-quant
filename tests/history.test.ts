import { afterEach, expect, it, vi } from 'vitest';
import { alignHistory, historicalSeries } from '../src/lib/backend/history';
import { cached } from '../src/lib/backend/cache';
import { addDays, nyTime } from '../src/lib/backend/clock';
import { FX, type FxBar, type Observation } from '../src/lib/backend/types';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
function fixture(n=150){
 const dates:string[]=[];for(let d='2026-01-05';dates.length<n;d=addDays(d,1))if(new Date(d).getUTCDay()%6)dates.push(d);
 const bars=dates.flatMap((day,i)=>['XAU_USD',...FX].map((instrument,j)=>({instrument,vendor:'OANDA',start_at:nyTime(addDays(day,-1)),close_at:nyTime(day),open:100+j,high:110+j,low:90+j,close:100+j+i*.1,volume:10,complete:true as const,available_at:'2026-10-28T12:00:00Z'})));
 const macro=Object.fromEntries(['oil','ry','vix'].map(k=>[k,dates.map((d,i)=>({series_id:k,obs_date:d,value:k==='ry'?2+i/100:70+i/10,available_at:nyTime(d,0),vendor:'FRED',availability_basis:'vintage_day_end' as const}))]));return {dates,bars,macro};
}
it('uses downloaded prices immediately without forging availability evidence',()=>{
 const {bars,macro}=fixture();const r=alignHistory(bars,macro,'2026-10-28T12:00:00Z');
 expect(r.data.gold).toHaveLength(150);expect(r.data.dxy).toHaveLength(150);expect(r.data.oil).toHaveLength(150);expect(r.analysisData?.gold).toHaveLength(150);
 expect(bars[0].available_at).toBe('2026-10-28T12:00:00Z');expect(r.data.cot).toBeNull();expect(r.data.etf).toBeNull();
});
it('does not put a later macro release or current revision into earlier bars',()=>{
 const {bars,macro}=fixture();macro.oil=macro.oil.map(p=>({...p,available_at:'2026-10-28T12:00:00Z'}));macro.ry=macro.ry.map(p=>({...p,availability_basis:'first_seen' as never}));
 const r=alignHistory(bars,macro,'2026-10-28T12:00:00Z');expect(r.data.oil).toBeNull();expect(r.data.ry).toBeNull();expect(r.analysisData).toBeNull();expect(r.data.gold).toHaveLength(150);
});
it('keeps full gold history and uses only a contiguous eligible suffix for factors',()=>{
 const {bars,macro,dates}=fixture(200);macro.oil=macro.oil.filter(p=>p.obs_date<dates[20]||p.obs_date>dates[40]);
 const r=alignHistory(bars,macro,'2026-10-28T12:00:00Z');expect(r.data.gold).toHaveLength(200);expect(r.data.oil).toBeNull();expect(r.analysisData!.dates[0]).toBe(dates[41]);expect(r.analysisData!.gold).toHaveLength(159);
});
it('does not substitute an incomplete DXY basket or allow missing context to block prices',()=>{
 const {bars}=fixture();const r=alignHistory(bars.filter(b=>b.instrument!=='USD_SEK'),{},'2026-10-28T12:00:00Z');expect(r.data.gold).toHaveLength(150);expect(r.data.dxy).toBeNull();expect(r.data.vix).toBeNull();
});
it('fetches provider candles even when the archive and optional feeds are unavailable',async()=>{
 const seen:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async (url:string)=>{seen.push(url);if(url.includes('/candles?')){const instrument=url.split('/instruments/')[1].split('/')[0];return Response.json({instrument,granularity:'D',candles:[{time:'2026-10-26T21:00:00Z',complete:true,volume:2,mid:{o:'4000',h:'4020',l:'3990',c:'4010'}}]});}return Response.json({}, {status:403});}));
 const r=await historicalSeries({OANDA_API_TOKEN:'fixture',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'fixture'});
 expect(r.data.gold).toEqual([4010]);expect(r.meta.researchEligible).toBe(false);expect(r.data.oil).toBeNull();expect(seen.some(u=>u.includes('series_as_of'))).toBe(false);expect(r.label).not.toContain('Synthetic');
});
it('deduplicates concurrent requests, expires strictly, and never caches a rejected load',async()=>{
 vi.useFakeTimers();let resolve!:(v:number)=>void;const load=vi.fn(()=>new Promise<number>(r=>resolve=r));const read=cached(10000,load);
 const a=read(),b=read();expect(load).toHaveBeenCalledTimes(1);resolve(1);expect(await a).toBe(1);expect(await b).toBe(1);await read();expect(load).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(10001);const c=read();resolve(2);expect(await c).toBe(2);expect(load).toHaveBeenCalledTimes(2);
 const fail=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(3),retry=cached(1000,fail);await expect(retry()).rejects.toThrow('offline');expect(await retry()).toBe(3);
});
