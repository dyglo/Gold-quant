import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '../src/lib/legacy/app';
import { synth } from '../src/lib/data/synthetic';
vi.mock('../src/lib/data/trials',()=>({trialRecorder:()=>({load:()=>{},record:vi.fn()})}));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
it('fills the original panels, keeps research local, refreshes vendors, and disposes polling',async()=>{
 vi.useFakeTimers();const nodes=new Map<string,any>();const draw=vi.fn();
 const context=new Proxy({}, {get:()=>draw,set:()=>true});
 const element=(id:string)=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',className:'',value:({spl:'60',cb:'1',dl:'0',bm:'bias',er:'all'} as any)[id]??'',tBodies:[{innerHTML:''}],tHead:{rows:[{cells:[{},{},{}]}]},clientWidth:700,clientHeight:150,width:0,height:0,getContext:()=>context});return nodes.get(id)};
 vi.stubGlobal('document',{getElementById:element,hidden:false});vi.stubGlobal('devicePixelRatio',1);vi.stubGlobal('addEventListener',vi.fn());vi.stubGlobal('removeEventListener',vi.fn());
 const data=Object.fromEntries(Object.entries(synth(7)).map(([k,v])=>[k,v.slice(-150)])) as ReturnType<typeof synth>;
 const load=vi.fn(async()=>({data,label:'Provider history · daily',meta:{researchEligible:false}}));
 const quote=vi.fn(async()=>({price:4050,time:new Date().toISOString(),basis:'bid/ask midpoint',status:'current'}));
 const intraday=vi.fn(async()=>({points:[{time:'2026-10-28T10:00:00Z',price:4000},{time:'2026-10-28T10:15:00Z',price:4002}]}));const dispose=mount({load,quote,intraday});await vi.waitFor(()=>expect(element('fm').innerHTML).toContain('β DXY'));
 expect(element('pv').textContent).toContain('4,050');expect(element('dt').textContent).toContain('Bid/ask mid');expect(element('bl').textContent).toMatch(/Bullish|Bearish|Neutral/);expect(element('fm').innerHTML).toContain('β DXY');expect(element('bt').tBodies[0].innerHTML).toContain('Strict point-in-time');expect(draw).toHaveBeenCalled();
 expect(element('rng').innerHTML).toContain('1W');expect(element('rng').innerHTML).toContain('1D');element('rng').onclick({target:{dataset:{r:'1D'}}});await vi.advanceTimersByTimeAsync(1);expect(intraday).toHaveBeenCalledTimes(1);expect(element('d2').textContent).toContain('15-minute');element('rng').onclick({target:{dataset:{r:'1W'}}});expect(element('d1').innerHTML).toContain('1W');element('nw').onclick();await vi.advanceTimersByTimeAsync(1);expect(load).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(15000);expect(quote.mock.calls.length).toBeGreaterThan(2);dispose();const count=quote.mock.calls.length;await vi.advanceTimersByTimeAsync(30000);expect(quote).toHaveBeenCalledTimes(count);
});
