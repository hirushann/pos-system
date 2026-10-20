'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BRAND } from '@/src/lib/brand';
import { authClient, useSession } from '@/src/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModeToggle } from '@/components/mode-toggle';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bannedParam = searchParams.get('error') === 'banned';
  const { data: session, isPending } = useSession();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    bannedParam ? 'Your account has been deactivated. Please contact the store owner.' : null,
  );

  // If redirected with error=banned, invalidate any residual local session token
  React.useEffect(() => {
    if (bannedParam) {
      authClient.signOut();
    }
  }, [bannedParam]);

  // If already authenticated and not banned, redirect according to role
  React.useEffect(() => {
    if (!isPending && session?.user && !session.user.banned && !bannedParam) {
      const userRole = (session.user as { role?: string }).role;
      router.push(userRole === 'owner' ? '/dashboard' : '/checkout');
    }
  }, [session, isPending, bannedParam, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });

      if (result.error) {
        if (result.error.status === 403 || result.error.message?.toLowerCase().includes('banned')) {
          setErrorMessage('Your account has been deactivated. Please contact the store owner.');
        } else if (
          result.error.message?.toLowerCase().includes('credential') ||
          result.error.message?.toLowerCase().includes('invalid')
        ) {
          setErrorMessage('Invalid email or password. Please verify your credentials.');
        } else {
          setErrorMessage(result.error.message || 'Failed to sign in. Please try again.');
        }
        setIsLoading(false);
        return;
      }

      const role = (result.data?.user as { role?: string } | undefined)?.role;
      router.push(role === 'owner' ? '/dashboard' : '/checkout');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email Address
        </label>
        <Input
          id="email"
          type="email"
          required
          autoFocus
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
          className="h-10"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Password
        </label>
        <Input
          id="password"
          type="password"
          required
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="current-password"
          className="h-10"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-10 font-semibold tracking-wide"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span>Signing In...</span>
          </>
        ) : (
          'Sign In to Register'
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4 sm:p-6 md:p-10">
      {/* Top right theme toggle */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ModeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Image
            src={BRAND.logo}
            alt={BRAND.name}
            width={BRAND.logoWidth}
            height={BRAND.logoHeight}
            priority
            className="h-40 w-auto rounded-2xl bg-white p-2 shadow-sm sm:h-48"
          />
          <h1 className="sr-only">{BRAND.name}</h1>
          <p className="text-sm text-muted-foreground">
            Point of Sale & Inventory System
          </p>
        </div>

        {/* Login form card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <React.Suspense fallback={<div className="h-48 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <LoginForm />
          </React.Suspense>

          <div className="mt-6 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Cashier accounts are provisioned by the store owner.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
