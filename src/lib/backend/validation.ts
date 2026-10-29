import { Database } from './db';
import { readSeries } from './series';
import { score,type ModelConfig } from './model';
import { allRows } from './ledger';
import { worstGrade } from './evidence';
import { canonical,sha256 } from './chain';
import { informationCoefficient,buckets,permutationNull,walkForward,mean,deflatedSharpe,probabilityBacktestOverfit } from '../stats';
export async function validation(db:Database,version:string|null,horizon:number) {
  const models=await db.call<{id:string;config:ModelConfig}[]>(`model_versions?select=id,config&${version?`id=eq.${encodeURIComponent(version)}&`:''}order=created_at.desc&limit=1`);
  if(!models.length)return {label:'research, not live',verdict:'insufficient evidence',reason:'No frozen model version registered'};
  const model=models[0],asof=await db.now(),rows=await readSeries(db,asof);
  const prices=await allRows<{close_at:string;close:number}>(db,'fx_bars?select=close_at,close&instrument=eq.XAU_USD&order=close_at.asc,id.desc');
  const unique=[...new Map(prices.map(p=>[p.close_at,p])).values()];
  const dates=unique.map(p=>p.close_at.slice(0,10));
  const samples:{x:number;y:number;grade:'A'|'B'|'C';momentum:number}[]=[];
  let blocked=0; const blockedReasons:Record<string,number>={};
  for(let i=62;i<rows.length;i++) {
    const index=dates.indexOf(rows[i].bar_date);if(index<20||index+horizon>=unique.length)continue;
    try {const s=score(rows.slice(0,i+1),model.config);samples.push({x:s.bias_score,y:Math.log(unique[index+horizon].close/unique[index].close),grade:s.grade,momentum:Math.sign(unique[index].close-unique[index-20].close)});}
    catch(e) {blocked++;const reason=e instanceof Error?e.message:'UNKNOWN';blockedReasons[reason]=(blockedReasons[reason]??0)+1;}
  }
  const x=samples.map(s=>s.x),y=samples.map(s=>s.y),ic=informationCoefficient(x,y,horizon),bucket=buckets(x,y,model.config.threshold);
  const trials=await db.call<{candidate_count:number}[]>('trials?select=candidate_count&limit=1000');
  const trialCount=trials.reduce((s,t)=>s+t.candidate_count,0);
  const result={label:'research, not live',model_version:model.id,horizon,grade:worstGrade(samples.map(s=>s.grade)),ic,buckets:bucket,
    null:permutationNull(x,y,1729,999,Math.max(horizon+1,Math.ceil(Math.cbrt(x.length)))),
    baselines:{alwaysLong:{mean:y.length?mean(y):null,n:y.length},momentum20:{ic:informationCoefficient(samples.map(s=>s.momentum),y,horizon)}},
    walkForward:{folds:walkForward(samples.length,horizon),status:'fixed frozen rule; no parameter fitting'},
    pnl:{status:'insufficient evidence: historical OANDA bid/ask spreads are not yet archived; midpoint returns are not executable PnL'},
    deflatedSharpe:deflatedSharpe([],trialCount,null),pbo:probabilityBacktestOverfit([]),blockedBars:blocked,blockedReasons,
    verdict:ic.status==='insufficient evidence'||bucket.monotonic===null?'insufficient evidence':ic.ci&&ic.ci[0]>0&&bucket.monotonic?'positive research association; prospective confirmation required':'no reliable positive association'};
  const data_snapshot_hash=await sha256(canonical({rows,prices:unique,model:model.id,horizon}));
  await db.append('research_results',[{model_version:model.id,horizon,data_snapshot_hash,result}]);
  return result;
}
