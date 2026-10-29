import { authorize } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { allRows } from '@/lib/backend/ledger';
import { verifyChain,type ChainRow } from '@/lib/backend/chain';
import { errorResponse,privateJson } from '@/lib/backend/responses';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await authorize(request);return privateJson(request,await verifyChain(await allRows<ChainRow>(new Database(process.env),'signal_ledger?select=*&order=id.asc')));}catch(e){return errorResponse(e);}}
