import { authorize } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { allRows } from '@/lib/backend/ledger';
import { errorResponse,privateJson } from '@/lib/backend/responses';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await authorize(request);const db=new Database(process.env),snapshots=await allRows<{snapshot_date:string;series_id:string}>(db,'daily_snapshots?select=snapshot_date,series_id&order=snapshot_date.asc');return privateJson(request,{snapshotDays:new Set(snapshots.map(s=>s.snapshot_date)).size,reason:'Minimum 252 eligible labels, 30 independent blocks and 30 observations in each bucket. Historical executable PnL additionally requires real bid/ask costs.'});}catch(e){return errorResponse(e);}}
