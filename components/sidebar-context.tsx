'use client';

import * as React from 'react';

interface SidebarContextValue {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  isMobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined);

function subscribe(onStoreChange: () => void) {
  window.addEventListener('pos_sidebar_change', onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener('pos_sidebar_change', onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function getSnapshot() {
  return localStorage.getItem('pos_sidebar_collapsed') === 'true';
}

function getServerSnapshot() {
  return false;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isCollapsed = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isMobileOpen, setMobileOpen] = React.useState(false);

  const toggleCollapse = React.useCallback(() => {
    const next = !getSnapshot();
    localStorage.setItem('pos_sidebar_collapsed', String(next));
    window.dispatchEvent(new Event('pos_sidebar_change'));
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        toggleCollapse,
        isMobileOpen,
        setMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
