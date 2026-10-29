import type { BarRow, Point } from './types';
import { requireEvidence } from './evidence';

export const DEFAULT_MODEL = {
  engine: 'fundamental-v1', window: 60, momentum: 20, trend: 50,
  threshold: .25, stretch: 2, regimeMinR2: .1, regimeMinShare: .05, regimeMultiplier: 2,
  weights: { ry: 1, dxy: 1, oil: .5, etf: 1, cot: 1, vix: .5, stretch: 1, trend: 1 },
  cotLow: .1, cotHigh: .9, vixHigh: .75,
};
export type ModelConfig = typeof DEFAULT_MODEL;
const core = ['gold', 'dxy', 'oil', 'ry'];
function fit(y: number[], x: number[][]) {
  const n = y.length, my = y.reduce((a,b)=>a+b,0)/n;
  const mx = x.map(a=>a.reduce((s,v)=>s+v,0)/n);
  const covariance = x.map(a=>a.reduce((s,v,i)=>s+(v-mx[x.indexOf(a)])*(y[i]-my),0));
  const matrix = x.map((a,j)=>[...x.map((b,k)=>a.reduce((s,v,i)=>s+(v-mx[j])*(b[i]-mx[k]),0)), covariance[j]]);
  for (let j=0;j<3;j++) {
    let p=j; for(let k=j+1;k<3;k++) if(Math.abs(matrix[k][j])>Math.abs(matrix[p][j])) p=k;
    [matrix[j],matrix[p]]=[matrix[p],matrix[j]];
    const d=matrix[j][j]; if(Math.abs(d)<1e-16) throw new Error('SINGULAR_FACTOR_WINDOW');
    for(let k=j;k<4;k++) matrix[j][k]/=d;
    for(let i=0;i<3;i++) if(i!==j) { const f=matrix[i][j]; for(let k=j;k<4;k++) matrix[i][k]-=f*matrix[j][k]; }
  }
  const beta=matrix.map(r=>r[3]), intercept=my-beta.reduce((s,b,j)=>s+b*mx[j],0);
  const sst=y.reduce((s,v)=>s+(v-my)**2,0), sse=y.reduce((s,v,i)=>s+(v-intercept-beta.reduce((t,b,j)=>t+b*x[j][i],0))**2,0);
  return { beta, intercept, sd: Math.sqrt(sse/(n-4)), shares: beta.map((b,j)=>b*covariance[j]/sst) };
}
/** Same frozen rule as the dashboard; each score uses only its prefix. */
export function score(rows: BarRow[], config: ModelConfig = DEFAULT_MODEL) {
  if (config.engine !== 'fundamental-v1') throw new Error('UNSUPPORTED_MODEL_ENGINE');
  let start=rows.length;
  while(start>0&&core.every(k=>rows[start-1].points[k]))start--;
  rows=rows.slice(start);
  const n=rows.length, last=rows.at(-1)!;
  if(n<config.window+2) throw new Error('INSUFFICIENT_WARMUP');
  const used: Point[]=[];
  const values=(key:string, required=true) => {
    if (!rows.every(r=>r.points[key] && Number.isFinite(r.points[key].value))) {
      if(required) throw new Error('MISSING_'+key); return null;
    }
    for(const r of rows) {
      const p=r.points[key];
      if(Date.parse(p.available_at)>Date.parse(r.bar_close) || p.obs_date>r.bar_date) throw new Error('LOOK_AHEAD_BLOCKED');
      used.push(p);
    }
    return rows.map(r=>r.points[key].value);
  };
  const arrays=Object.fromEntries(core.map(k=>[k,values(k)!]));
  const returns=(a:number[])=>a.slice(1).map((v,i)=>Math.log(v/a[i]));
  if(['gold','dxy','oil'].some(k=>arrays[k].some(v=>v<=0))) throw new Error('NONPOSITIVE_INPUT');
  const y=returns(arrays.gold), x=[returns(arrays.dxy),returns(arrays.oil),arrays.ry.slice(1).map((v,i)=>v-arrays.ry[i])];
  const f=fit(y.slice(-config.window-1,-1),x.map(a=>a.slice(-config.window-1,-1)));
  const names=['DXY-driven','Oil-driven','Real-driven'], r2=f.shares.reduce((a,b)=>a+b,0), max=Math.max(...f.shares);
  const regime=r2<config.regimeMinR2||max<config.regimeMinShare?'Idiosyncratic':names[f.shares.indexOf(max)];
  const votes: { name: string; vote: number; weight: number }[]=[];
  const push=(name:keyof ModelConfig['weights'],vote:number,boost=false)=>votes.push({name,vote,weight:config.weights[name]*(boost?config.regimeMultiplier:1)});
  const delta=(a:number[])=>a[n-1]-a[n-1-config.momentum];
  push('ry',delta(arrays.ry)<0?1:-1,regime==='Real-driven');
  push('dxy',delta(arrays.dxy)<0?1:-1,regime==='DXY-driven');
  push('oil',delta(arrays.oil)>0?1:-1,regime==='Oil-driven');
  const etf=values('etf',false), cot=values('cot',false), vix=values('vix',false);
  const percentile=(a:number[])=>a.filter(v=>v<=a[n-1]).length/a.length;
  if(etf) push('etf',delta(etf)>0?1:-1);
  if(cot) push('cot',percentile(cot)>config.cotHigh?-1:percentile(cot)<config.cotLow?1:0);
  if(vix) push('vix',percentile(vix)>config.vixHigh?1:0);
  const z=(y.at(-1)!-f.intercept-f.beta.reduce((s,b,j)=>s+b*x[j].at(-1)!,0))/f.sd;
  if(!Number.isFinite(z)) throw new Error('DEGENERATE_RESIDUAL');
  push('stretch',z>config.stretch?-1:z<-config.stretch?1:0);
  push('trend',arrays.gold[n-1]>arrays.gold.slice(-config.trend).reduce((s,v)=>s+v,0)/config.trend?1:-1);
  const bias_score=votes.reduce((s,v)=>s+v.vote*v.weight,0)/votes.reduce((s,v)=>s+v.weight,0);
  return { bar_date:last.bar_date, regime, probabilities:Object.fromEntries([...names,'Idiosyncratic'].map(k=>[k,k===regime?1:0])),
    bias_score, votes, signal:bias_score>config.threshold?'Bullish':bias_score< -config.threshold?'Bearish':'Neutral', grade:requireEvidence(used) };
}
