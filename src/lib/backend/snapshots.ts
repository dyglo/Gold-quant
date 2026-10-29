import { Database } from './db';
import { canonical, sha256 } from './chain';
import type { Observation } from './types';

/** Captures current, already-retrieved values. Never backdates the capture clock. */
export async function captureSnapshots(db: Database) {
  const catalog=await db.call<{id:string}[]>('series?select=id&active=eq.true');
  let count=0;
  for(const {id} of catalog) {
    const payload=await db.call<Observation[]>(`observations?select=series_id,obs_date,value,available_at,vendor,availability_basis,evidence_grade&series_id=eq.${id}&availability_basis=eq.first_seen&order=obs_date.desc,available_at.desc&limit=1`);
    if(!payload.length) continue;
    // Stale snapshots do not count as newly collected evidence.
    const now=await db.now();
    if(Date.parse(now)-Date.parse(payload[0].available_at)>86400000) continue;
    count+=await db.append('daily_snapshots',[{series_id:id,payload,snapshot_hash:await sha256(canonical(payload))}]);
  }
  return count;
}
