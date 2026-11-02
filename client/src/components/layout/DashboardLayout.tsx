import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../util/navbar';
import Sidebar from '../util/sidebar';

const DashboardLayout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const sync = () => { if (desktop.matches) closeSidebar(); };
    desktop.addEventListener('change', sync);
    return () => desktop.removeEventListener('change', sync);
  }, [closeSidebar]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const isHorizontalSwipe = Math.abs(deltaX) > 70 && Math.abs(deltaY) < 50;

    if (isHorizontalSwipe) {
      const startedNearLeftEdge = touchStartRef.current.x < 32;
      if (!mobileSidebarOpen && startedNearLeftEdge && deltaX > 0) {
        setMobileSidebarOpen(true);
      }
      if (mobileSidebarOpen && deltaX < 0) {
        setMobileSidebarOpen(false);
      }
    }

    touchStartRef.current = null;
  };

  return (
    <div
      className="flex min-h-screen items-stretch"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-overlay md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div inert={mobileSidebarOpen} className={`flex-1 min-w-0 min-h-screen bg-canvas transition-[margin] duration-200 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'}`}>
        <a href="#main-content" className="ss-skip-link">Skip to content</a>
        <Navbar onMenuToggle={() => setMobileSidebarOpen(true)} mobileMenuOpen={mobileSidebarOpen} />
        <main id="main-content" tabIndex={-1} className="p-3 sm:p-5 lg:p-7 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;


