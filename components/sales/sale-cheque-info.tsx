'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setSaleChequeStatus } from '@/src/actions/sales';
import type { SaleDetail } from '@/src/data/sales';
import { cn } from '@/lib/utils';

const TONE = {
  pending: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  cleared: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  bounced: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

/** Cheque number, bank, date and status of a sale paid by cheque. Only the owner can change the status. */
export function SaleChequeInfo({ sale, isOwner }: { sale: SaleDetail; isOwner: boolean }) {
  const router = useRouter();
  if (sale.paymentMethod !== 'Cheque' || !sale.chequeStatus) return null;

  const change = async (status: 'pending' | 'cleared' | 'bounced') => {
    const res = await setSaleChequeStatus(sale.id, status);
    if (res.success) {
      toast.success(`Cheque marked ${status}.`);
      router.refresh();
    } else {
      toast.error(res.error ?? 'Could not update the cheque.');
    }
  };

  return (
    <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Cheque no.</span>
        <span className="font-mono font-semibold">{sale.chequeNumber}</span>
      </div>
      {sale.chequeBank && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Bank</span>
          <span>{sale.chequeBank}</span>
        </div>
      )}
      {sale.chequeDate && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Cheque date</span>
          <span className="font-mono">{sale.chequeDate}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Status</span>
        {isOwner ? (
          <Select value={sale.chequeStatus} onValueChange={(v) => change(v as 'pending' | 'cleared' | 'bounced')}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge className={cn('border-0 capitalize', TONE[sale.chequeStatus])}>{sale.chequeStatus}</Badge>
        )}
      </div>
    </div>
  );
}
