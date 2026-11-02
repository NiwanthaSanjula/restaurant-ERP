import React from 'react';

/**
 * Static shell mimicking the dashboard layout so the POS Register modal
 * sits over a dimmed, blurred “real” page (same idea as opening POS from the dashboard).
 */
const PosSessionBackdrop: React.FC = () => (
  <div
    className="fixed inset-0 z-0 flex overflow-hidden bg-surface-muted"
    aria-hidden
  >
    <aside className="hidden sm:flex w-[220px] md:w-[260px] shrink-0 flex-col bg-primary text-on-primary text-[11px] font-medium pt-6 px-4 gap-3 border-r border-line/5">
      <div className="h-8 w-24 rounded bg-surface-muted mb-4" />
      {['Dashboard', 'Products', 'People', 'Warehouse', 'Sale', 'Reports', 'Settings'].map((label) => (
        <div key={label} className="flex items-center gap-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-surface-muted" />
          <span>{label}</span>
        </div>
      ))}
    </aside>
    <div className="flex-1 flex flex-col min-w-0 bg-surface-muted">
      <header className="h-14 shrink-0 bg-surface border-b border-line flex items-center px-4 gap-4">
        <div className="h-8 flex-1 max-w-md rounded-lg bg-surface-muted border border-line/80" />
        <div className="h-9 w-20 rounded-lg bg-primary" />
        <div className="h-9 w-9 rounded-full bg-surface-muted" />
      </header>
      <main className="p-4 md:p-6 flex flex-col gap-4 flex-1 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[88px] rounded-xl border border-primary-line/70 bg-surface-muted"
            />
          ))}
        </div>
        <div className="flex-1 min-h-[160px] rounded-xl bg-surface border border-line relative overflow-hidden">
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-surface-muted" />
          <div className="absolute inset-x-8 bottom-8 h-px bg-surface-muted" />
          <div className="absolute inset-x-8 bottom-12 h-16 border-l border-b border-line/80 rounded-bl-md" />
        </div>
      </main>
    </div>
  </div>
);

export default PosSessionBackdrop;
