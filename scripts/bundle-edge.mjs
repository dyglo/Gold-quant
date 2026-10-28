import { build } from 'esbuild';
await build({ entryPoints: ['src/lib/backend/ingest.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: 'supabase/functions/_shared/ingest.js' });
