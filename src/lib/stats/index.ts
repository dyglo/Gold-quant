/** Pure statistics. No provider access, clocks, global randomness, or UI state. */
export const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
export function ranks(a:number[]) {
  if(a.some(v=>!Number.isFinite(v))) throw new Error('NONFINITE_SAMPLE');
  const ordered=a.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v), out=new Array<number>(a.length);
  for(let i=0;i<ordered.length;) { let j=i+1; while(j<ordered.length&&ordered[j].v===ordered[i].v)j++; for(let k=i;k<j;k++)out[ordered[k].i]=(i+j+1)/2; i=j; }
  return out;
}
export function correlation(a:number[],b:number[]):number|null {
  if(a.length!==b.length) throw new Error('SAMPLE_LENGTH_MISMATCH');
  if(a.length<3)return null;
  const am=mean(a),bm=mean(b);let xy=0,xx=0,yy=0;
  for(let i=0;i<a.length;i++){xy+=(a[i]-am)*(b[i]-bm);xx+=(a[i]-am)**2;yy+=(b[i]-bm)**2;}
  return xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null;
}
export const spearman=(a:number[],b:number[])=>correlation(ranks(a),ranks(b));
export function rng(seed:number) { let s=seed>>>0; return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}; }
const quantile=(a:number[],p:number)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*p)];};
export function minimumSample(horizon:number) {return Math.max(252,30*(horizon+1));}
export function informationCoefficient(scores:number[],returns:number[],horizon:number,seed=1729,repetitions=999) {
  if(![1,5,20].includes(horizon))throw new Error('INVALID_HORIZON');
  const n=scores.length,ic=spearman(scores,returns), block=Math.max(horizon+1,Math.ceil(Math.cbrt(n))), random=rng(seed), samples:number[]=[];
  if(ic!==null)for(let r=0;r<repetitions;r++) {
    const x:number[]=[],y:number[]=[];
    while(x.length<n){const start=Math.floor(random()*n);for(let j=0;j<block&&x.length<n;j++){const i=(start+j)%n;x.push(scores[i]);y.push(returns[i]);}}
    const value=spearman(x,y);if(value!==null)samples.push(value);
  }
  // Conservative independent-block count, explicitly not an iid row count.
  const effectiveSampleSize=Math.floor(n/block);
  return {ic,n,ci:samples.length?[quantile(samples,.025),quantile(samples,.975)]:null,effectiveSampleSize,
    effectiveSampleMethod:'independent block count (conservative)',blockLength:block,minimumSample:minimumSample(horizon),
    status:n<minimumSample(horizon)||effectiveSampleSize<30||ic===null?'insufficient evidence':'estimated',method:'paired circular block bootstrap',seed};
}
export function buckets(scores:number[],returns:number[],threshold=.25) {
  const groups=['Bearish','Neutral','Bullish'].map(name=>{
    const r=returns.filter((_,i)=>(scores[i]>threshold?'Bullish':scores[i]< -threshold?'Bearish':'Neutral')===name);
    return {bucket:name,n:r.length,mean:r.length?mean(r):null,hitRate:r.length&&name!=='Neutral'?r.filter(v=>name==='Bullish'?v>0:v<0).length/r.length:null};
  });
  return {groups,unconditionalMean:returns.length?mean(returns):null,monotonic:groups.some(g=>g.n<30)?null:groups[0].mean!<=groups[1].mean!&&groups[1].mean!<=groups[2].mean!};
}
export function permutationNull(scores:number[],returns:number[],seed=1729,repetitions=999,blockLength=1) {
  const observed=spearman(scores,returns),random=rng(seed); if(observed===null)return {pValue:null,seed,repetitions};
  let exceed=0;
  const blocks:number[][]=[];for(let i=0;i<scores.length;i+=blockLength)blocks.push(scores.slice(i,i+blockLength));
  for(let r=0;r<repetitions;r++) {
    const order=blocks.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    const shuffled=order.flatMap(i=>blocks[i]),v=spearman(shuffled,returns);
    if(v!==null&&Math.abs(v)>=Math.abs(observed)-1e-12)exceed++;
  }
  return {pValue:(exceed+1)/(repetitions+1),seed,repetitions,blockLength};
}
export function walkForward(n:number,horizon:number,train=252,test=63,embargo=horizon) {
  if(embargo<horizon)throw new Error('EMBARGO_BELOW_HORIZON');
  const folds:{trainStart:number;trainEnd:number;testStart:number;testEnd:number;purge:number;embargo:number}[]=[];
  for(let start=train+horizon+embargo;start<n;start+=test+embargo)folds.push({trainStart:0,trainEnd:start-horizon-embargo,testStart:start,testEnd:Math.min(n,start+test),purge:horizon,embargo});
  return folds;
}
const cdf=(x:number)=>{const t=1/(1+.2316419*Math.abs(x)),p=.3989422804*Math.exp(-x*x/2)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x>=0?1-p:p;};
const inverse=(p:number)=>{let lo=-9,hi=9;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(cdf(m)<p)lo=m;else hi=m;}return (lo+hi)/2;};
export const sharpe=(a:number[])=>{if(a.length<2)return null;const m=mean(a),v=a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1);return v>0?m/Math.sqrt(v):null;};
/** DSR needs the variance of trial Sharpes, not merely the trial count. */
export function deflatedSharpe(returns:number[],trialCount:number,trialSharpeVariance:number|null) {
  if(returns.length<252||trialCount<1||trialSharpeVariance===null||trialSharpeVariance<0)return {probability:null,trialCount,status:'insufficient evidence: trial Sharpe variance or sample missing'};
  const sr=sharpe(returns);if(sr===null)return {probability:null,trialCount,status:'insufficient evidence: zero variance'};
  const m=mean(returns),sd=Math.sqrt(mean(returns.map(v=>(v-m)**2))),skew=mean(returns.map(v=>((v-m)/sd)**3)),kurtosis=mean(returns.map(v=>((v-m)/sd)**4));
  const benchmark=trialCount===1?0:Math.sqrt(trialSharpeVariance)*((1-.5772156649)*inverse(1-1/trialCount)+.5772156649*inverse(1-1/(trialCount*Math.E)));
  const denominator=1-skew*sr+(kurtosis-1)*sr*sr/4;
  return {probability:denominator>0?cdf((sr-benchmark)*Math.sqrt(returns.length-1)/Math.sqrt(denominator)):null,trialCount,benchmark,status:'estimated; independent trials approximation'};
}
/** CSCV only on a complete, common-bar candidate return matrix. */
export function probabilityBacktestOverfit(candidates:number[][],partitions=8) {
  const n=candidates[0]?.length??0;
  if(candidates.length<2||n<252||partitions%2||partitions<4||partitions>12||candidates.some(a=>a.length!==n||a.some(v=>!Number.isFinite(v))))return {probability:null,status:'not applicable: requires multiple complete comparable candidates'};
  const combinations:number[][]=[];
  function choose(start:number,selected:number[]){if(selected.length===partitions/2){combinations.push(selected);return;}for(let i=start;i<partitions;i++)choose(i+1,[...selected,i]);}choose(0,[]);
  let bad=0,valid=0;
  for(const chosen of combinations){const train=candidates.map(a=>a.filter((_,i)=>chosen.includes(Math.min(partitions-1,Math.floor(i*partitions/n))))),test=candidates.map(a=>a.filter((_,i)=>!chosen.includes(Math.min(partitions-1,Math.floor(i*partitions/n)))));
    const ins=train.map(sharpe),outs=test.map(sharpe);if(ins.some(v=>v===null)||outs.some(v=>v===null))continue;
    const winner=ins.indexOf(Math.max(...ins as number[])),rank=ranks(outs as number[])[winner]/(candidates.length+1);if(rank<=.5)bad++;valid++;
  }
  return {probability:valid?bad/valid:null,status:valid?'estimated CSCV':'insufficient evidence',splits:valid};
}
