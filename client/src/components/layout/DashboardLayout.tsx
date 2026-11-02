import React, { useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../util/navbar';
import Sidebar from '../util/sidebar';

const DashboardLayout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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
        onClose={() => setMobileSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className={`flex-1 min-h-screen bg-[#F7F8FA] transition-[margin] duration-200 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'}`}>
        <Navbar />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;


