'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/suppliers', label: 'Suppliers', exact: true },
  { href: '/suppliers/invoices', label: 'Invoices' },
  { href: '/suppliers/payments', label: 'Payments & cheques' },
];

export function SuppliersNav() {
  const pathname = usePathname();
  return (
    <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'rounded-md px-3.5 py-1.5 font-medium transition-colors',
              active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
