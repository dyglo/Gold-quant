import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const names = ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'FRED_API_KEY', 'TWELVE_DATA_API_KEY', 'OANDA_API_TOKEN', 'OANDA_ACCOUNT_ID', 'CRON_SECRET'];
const values = names.map(name => process.env[name]).filter(value => value && value.length >= 12);
const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  const content = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (values.some(value => content.includes(value))) throw new Error(`Credential detected in staged file: ${file}`);
}
console.log('Staged files contain no configured credential values.');
