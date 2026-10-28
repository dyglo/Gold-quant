import Dashboard from '@/components/Dashboard';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorize } from '@/lib/backend/access';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let approved = false;
  try { await authorize(new Request('https://gold-quant.local/', { headers: { cookie: (await cookies()).toString() } })); approved = true; }
  catch { /* Verified authentication is required before rendering protected data. */ }
  if (!approved) redirect('/login?next=%2F');
  return <Dashboard />;
}
