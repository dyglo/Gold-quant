export function canonical(value: unknown): string {
  if(value===null || typeof value==='boolean' || typeof value==='string') return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new Error('NON_CANONICAL_VALUE');
}
export async function sha256(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
export type ChainRow = { id: number; canonical_payload: string; prev_hash: string; row_hash: string };
export async function verifyChain(rows: ChainRow[]) {
  let previous='0'.repeat(64);
  for(const row of rows) {
    if(row.prev_hash!==previous || canonical(JSON.parse(row.canonical_payload))!==row.canonical_payload || await sha256(row.canonical_payload+previous)!==row.row_hash)
      return { valid:false, firstBreak:row.id, checked:rows.indexOf(row) };
    previous=row.row_hash;
  }
  return {valid:true,firstBreak:null,checked:rows.length,head:previous,status:rows.length?'verified':'empty — no live signals yet'};
}
