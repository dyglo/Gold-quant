import { Database } from '../src/lib/backend/db';
import { DEFAULT_MODEL } from '../src/lib/backend/model';
import { canonical,sha256 } from '../src/lib/backend/chain';
import { appendDailyLedger,ledger,recordMissedDays,allRows } from '../src/lib/backend/ledger';
import { captureSnapshots } from '../src/lib/backend/snapshots';
import { execFileSync } from 'node:child_process';
try{process.loadEnvFile('.env.local');}catch{}
async function main(){const db=new Database(process.env),command=process.argv[2];
 if(command==='register') {const hash=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),id=await sha256(canonical({config:DEFAULT_MODEL,hash}));await db.insert('model_versions',{id,config:DEFAULT_MODEL,code_git_hash:hash,owner_id:process.env.ALLOWED_USER_IDS?.split(',')[0]});console.log({id});}
 else if(command==='snapshot')console.log({snapshots:await captureSnapshots(db)});
 else if(command==='daily'){await recordMissedDays(db);console.log(await appendDailyLedger(db));}
 else if(command==='verify')console.log((await ledger(db)).verification);
 else if(command==='outcomes'){
  const rows=(await ledger(db)).rows,prices=await allRows<{close_at:string;close:number}>(db,'fx_bars?select=close_at,close&instrument=eq.XAU_USD&order=close_at.asc,id.asc');
  const bars=[...new Map(prices.map(p=>[p.close_at,p])).values()];let written=0;
  for(const r of rows){const i=bars.findIndex(p=>p.close_at.slice(0,10)===r.bar_date);if(i<0)continue;for(const h of [1,5,20])if(bars[i+h])written+=await db.append('ledger_outcomes',[{ledger_id:r.id,horizon:h,entry_close:bars[i].close,exit_close:bars[i+h].close,exit_date:bars[i+h].close_at.slice(0,10),forward_return:Math.log(bars[i+h].close/bars[i].close)}]);}console.log({written});
 }else throw new Error('Use register, snapshot, daily, outcomes, verify');}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
