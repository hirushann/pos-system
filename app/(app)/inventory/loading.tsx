import { Skeleton } from '@/components/ui/skeleton';

export default function InventoryLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-80 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-10 w-44 rounded-lg" />
        <Skeleton className="h-10 w-44 rounded-lg" />
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-md" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
