'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Store, UserCircle, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/mode-toggle';
import { useSidebar } from '@/components/sidebar-context';
import { authClient, useSession } from '@/src/lib/auth-client';

export function AppHeader() {
  const router = useRouter();
  const { setMobileOpen } = useSidebar();
  const { data: session } = useSession();

  const user = session?.user;
  const isOwner = user?.role === 'owner';

  const handleLogout = async () => {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur-xs sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Button
          variant="outline"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Shop Name Placeholder */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Store className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm sm:text-base leading-tight">
                Colombo Auto Spares & Parts
              </span>
              <Badge variant="outline" className="hidden sm:inline-flex text-[10px] py-0 px-1.5 font-normal">
                Colombo 10
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">Retail Point of Sale</span>
          </div>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Currency badge */}
        <Badge variant="secondary" className="hidden sm:inline-flex text-xs font-mono font-medium">
          LKR (Rs.)
        </Badge>

        {/* User Menu */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 px-2.5 h-8 font-normal"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {isOwner ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserCircle className="h-3.5 w-3.5" />}
                </div>
                <span className="text-xs font-medium max-w-[120px] truncate hidden sm:inline">
                  {user.name || user.email}
                </span>
                <Badge
                  variant={isOwner ? 'default' : 'secondary'}
                  className="text-[10px] py-0 px-1.5 capitalize font-medium"
                >
                  {user.role || 'cashier'}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-xs text-muted-foreground leading-none">{user.email}</p>
                  <div className="pt-1.5">
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                      Role: {user.role || 'cashier'}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            <UserCircle className="h-3.5 w-3.5" />
            <span>Staff</span>
          </div>
        )}

        {/* Light / Dark Mode Toggle */}
        <ModeToggle />
      </div>
    </header>
  );
}
