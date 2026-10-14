'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground shadow-lg">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-block rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-destructive font-mono">
            System Error Encountered
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error.message || 'An unexpected error occurred while processing your request.'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button onClick={() => reset()} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span>Try Again</span>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/checkout">
              <Home className="h-4 w-4" />
              <span>Return to Checkout</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
