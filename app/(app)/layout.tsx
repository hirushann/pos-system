import { requireUser } from '@/src/lib/auth-guards';
import { SidebarProvider } from '@/components/sidebar-context';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication check for all routes under (app)/
  await requireUser();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/20">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
