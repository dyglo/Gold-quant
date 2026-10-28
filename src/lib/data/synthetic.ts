// @ts-nocheck
// Synthetic placeholder series. Same shape as a real feed: daily, equal length, ry in percent.
export type Series = { dates: string[]; gold: number[]; dxy: number[] | null; oil: number[] | null; ry: number[] | null; etf: number[] | null; cot: number[] | null; vix: number[] | null };
const bdays=n=>{const a=[];let q=new Date();while(a.length<n){if(q.getUTCDay()%6)a.unshift(q.toISOString().slice(0,10));q=new Date(+q-864e5)}return a};
export function synth(s){let a=s;const rn=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296},gs=()=>Math.sqrt(-2*Math.log(rn()||1e-9))*Math.cos(6.2832*rn());
 const n=1500,dates=bdays(1500),gold=[1800],dxy=[92],oil=[65],ry=[-.8],etf=[2800],cot=[180000],vix=[19];let e=0;
 for(let i=0;i<n;i++){if(!i)continue;
  const rd=.004*gs(),ro=.018*gs(),dy=.035*gs()+3*rd-.003*(ry[i-1]-1),post=i>900,bd=post?-.2:-.35,by=post?-.01:-.1,eps=.007*gs()-.06*e;e=eps;
  const rg=(post?.0009:.0004)+bd*rd+.05*ro+by*dy+eps;
  gold.push(gold[i-1]*Math.exp(rg));dxy.push(dxy[i-1]*Math.exp(rd));oil.push(oil[i-1]*Math.exp(ro));ry.push(ry[i-1]+dy);etf.push(etf[i-1]+900*Math.log(gold[i-1]/(gold[i-2]??gold[i-1]))+3*gs());cot.push(cot[i-1]+.02*(180000-cot[i-1])+3e6*rg+4000*gs());vix.push(Math.max(10,vix[i-1]+.1*(19-vix[i-1])+1.2*gs()+120*Math.abs(rg)))}
 return{dates,gold,dxy,oil,ry,etf,cot,vix}}
