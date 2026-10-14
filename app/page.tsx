import { redirect } from 'next/navigation';
import { getSessionContext } from '@/src/lib/auth-guards';

export default async function RootPage() {
  const ctx = await getSessionContext();
  if (ctx?.user?.role === 'owner') {
    redirect('/reports');
  }
  redirect('/checkout');
}
