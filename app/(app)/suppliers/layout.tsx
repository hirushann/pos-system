import { requireOwner } from '@/src/lib/auth-guards';

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  // Everything under /suppliers is owner-only
  await requireOwner();
  return <>{children}</>;
}
