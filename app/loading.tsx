import { Loader2 } from 'lucide-react';

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background/50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Loading POS System...
        </p>
      </div>
    </div>
  );
}
