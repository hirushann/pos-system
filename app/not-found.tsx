import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Wrench, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
          <Wrench className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            404 — Page Not Found
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Lost in the parts warehouse?
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The page or record you requested does not exist or may have been moved.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button asChild variant="default" className="gap-2">
            <Link href="/checkout">
              <Home className="h-4 w-4" />
              <span>Back to POS</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
              <span>Dashboard</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
