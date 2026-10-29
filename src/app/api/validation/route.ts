import { authorize } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { validation } from '@/lib/backend/validation';
import { BackendError } from '@/lib/backend/http';
import { errorResponse,privateJson } from '@/lib/backend/responses';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await authorize(request);const q=new URL(request.url).searchParams,h=Number(q.get('horizon')??1);if(![1,5,20].includes(h))throw new BackendError('INVALID_HORIZON',400);return privateJson(request,await validation(new Database(process.env),q.get('model_version'),h));}catch(e){return errorResponse(e);}}
