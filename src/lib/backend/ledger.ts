import { Database } from './db';
import { canonical, sha256, verifyChain, type ChainRow } from './chain';
import { readSeries } from './series';
import { score, type ModelConfig } from './model';
import { nyDate, nyTime, addDays } from './clock';
import { informationCoefficient } from '../stats';
export async function allRows<T>(db:Database,path:string) {
  const result:T[]=[];
  for(let offset=0;;offset+=500){const rows=await db.call<T[]>(`${path}&limit=500&offset=${offset}`);result.push(...rows);if(rows.length<500)return result;}
}
export type LedgerRow=ChainRow & {bar_date:string;model_version:string;bias_score:number;signal:string;grade:string};
export async function ledger(db:Database) {
  const rows=await allRows<LedgerRow>(db,'signal_ledger?select=*&order=id.asc');
  const outcomes=await allRows<{ledger_id:number;horizon:number;forward_return:number}>(db,'ledger_outcomes?select=*&order=ledger_id.asc,horizon.asc');
  const verification=await verifyChain(rows);
  const trackRecord=[1,5,20].map(horizon=>{
    const pairs=outcomes.filter(o=>o.horizon===horizon).flatMap(o=>{const r=rows.find(r=>r.id===o.ledger_id);return r?[{r,y:o.forward_return}]:[];});
    const directional=pairs.filter(p=>p.r.signal!=='Neutral');
    return {horizon,n:pairs.length,hitRate:directional.length?directional.filter(p=>Math.sign(p.r.bias_score)===Math.sign(p.y)).length/directional.length:null,
      ic:informationCoefficient(pairs.map(p=>p.r.bias_score),pairs.map(p=>p.y),horizon)};
  });
  return {rows,outcomes,verification,trackRecord,status:rows.length?`forward-tested since ${rows[0].bar_date}`:'awaiting first prospective close'};
}
export async function appendDailyLedger(db:Database) {
  const now=await db.now(),day=nyDate(now),close=nyTime(day);
  if(Date.parse(now)<Date.parse(close)+15*60000||Date.parse(now)>Date.parse(close)+6*3600000)return {status:'outside close window'};
  const business=await db.call<boolean>('rpc/us_business_day','POST',{d:day});if(!business)return {status:'non-business day'};
  if((await db.call<unknown[]>(`signal_ledger?select=id&bar_date=eq.${day}`)).length)return {status:'already recorded'};
  const versions=await db.call<{id:string;config:ModelConfig}[]>(`model_versions?select=id,config&created_at=lte.${encodeURIComponent(close)}&order=created_at.desc&limit=1`);
  if(!versions.length)throw new Error('NO_FROZEN_MODEL');
  const rows=await readSeries(db,close),payload=score(rows,versions[0].config);
  const data_snapshot_hash=await sha256(canonical(rows));
  await db.append('ledger_inputs',[{snapshot_hash:data_snapshot_hash,payload:rows}]);
  const head=await db.call<{row_hash:string}[]>('signal_ledger?select=row_hash&order=id.desc&limit=1');
  const prev_hash=head[0]?.row_hash??'0'.repeat(64);
  const canonical_payload=canonical({...payload,asof_ts:close,model_version:versions[0].id,data_snapshot_hash});
  await db.insert('signal_ledger',{canonical_payload,prev_hash,row_hash:await sha256(canonical_payload+prev_hash)});
  return {status:'recorded',day};
}
export async function recordMissedDays(db:Database) {
  const versions=await db.call<{created_at:string}[]>('model_versions?select=created_at&order=created_at.asc&limit=1');
  if(!versions.length)return;
  const end=nyDate(await db.now());
  for(let day=nyDate(versions[0].created_at);day<end;day=addDays(day,1)){
    if(!await db.call<boolean>('rpc/us_business_day','POST',{d:day}))continue;
    if(!(await db.call<unknown[]>(`signal_ledger?select=id&bar_date=eq.${day}`)).length)await db.append('ledger_gaps',[{bar_date:day,reason:'daily close job missed or failed; never filled retroactively'}]);
  }
}
