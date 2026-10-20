'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Database,
  Printer,
  Truck,
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/sidebar-context';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { useSession } from '@/src/lib/auth-client';
import { BRAND } from '@/src/lib/brand';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, ownerOnly: true },
  { title: 'Checkout', href: '/checkout', icon: ShoppingCart },
  { title: 'Products', href: '/products', icon: Package },
  { title: 'Labels', href: '/labels', icon: Printer, ownerOnly: true },
  { title: 'Inventory', href: '/inventory', icon: Boxes },
  { title: 'Sales', href: '/sales', icon: Receipt },
  { title: 'Suppliers', href: '/suppliers', icon: Truck, ownerOnly: true },
  { title: 'Reports', href: '/reports', icon: BarChart3, ownerOnly: true },
  { title: 'Users', href: '/users', icon: Users, ownerOnly: true },
  { title: 'Settings', href: '/settings', icon: Settings, ownerOnly: true },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapse, isMobileOpen, setMobileOpen } = useSidebar();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === 'owner';

  const visibleItems = navItems.filter((item) => !item.ownerOnly || isOwner);

  const renderNavLinks = (collapsed: boolean, onItemClick?: () => void) => {
    return (
      <nav className="flex flex-col gap-1 px-2 py-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          const linkContent = (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-2',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </nav>
    );
  };

  return (
    <>
      {/* Mobile Drawer */}
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b px-6 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <Image
                src={BRAND.emblem}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain"
              />
              <div className="flex flex-col">
                <span className="leading-tight">{BRAND.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{BRAND.subtitle}</span>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {renderNavLinks(false, () => setMobileOpen(false))}
          </div>
          <div className="border-t p-3">
            <Link
              href="/dev/db"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Database className="h-4 w-4" />
              <span>Dev DB Connection</span>
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col border-r bg-card transition-all duration-300 ease-in-out shrink-0 select-none',
          isCollapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Brand Header */}
        <div
          className={cn(
            'flex h-16 items-center border-b px-4',
            isCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Image
              src={BRAND.emblem}
              alt={BRAND.name}
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain shadow-xs"
            />
            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-semibold leading-tight tracking-tight">{BRAND.name}</span>
                <span className="truncate text-xs text-muted-foreground">{BRAND.subtitle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto py-2">
          {renderNavLinks(isCollapsed)}
        </div>

        {/* Bottom Dev DB & Collapse Toggle */}
        <div className="border-t p-2 flex flex-col gap-1">
          {/* Dev DB Link */}
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/dev/db"
                  className={cn(
                    'flex items-center justify-center rounded-lg p-2 text-sm transition-colors',
                    pathname === '/dev/db'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Database className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Dev DB Status
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/dev/db"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                pathname === '/dev/db'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Database className="h-4 w-4 shrink-0" />
              <span>Dev DB Connection</span>
            </Link>
          )}

          {/* Collapse Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'w-full text-muted-foreground hover:text-foreground',
              isCollapsed ? 'px-0 justify-center' : 'justify-between px-3',
            )}
          >
            {!isCollapsed && <span className="text-xs font-normal">Collapse Sidebar</span>}
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}
