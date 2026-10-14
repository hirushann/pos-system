'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AppLayoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('App layout error:', error);
  }, [error]);

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Error loading page data
          </h2>
          <p className="text-xs text-muted-foreground">
            {error.message || 'Failed to load data from the database. Please try again.'}
          </p>
        </div>

        <Button onClick={() => reset()} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Reload Section</span>
        </Button>
      </div>
    </div>
  );
}
