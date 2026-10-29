import { authorize } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { ledger } from '@/lib/backend/ledger';
import { errorResponse,privateJson } from '@/lib/backend/responses';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await authorize(request);return privateJson(request,await ledger(new Database(process.env)));}catch(e){return errorResponse(e);}}
