import React from 'react';

/**
 * Static shell mimicking the dashboard layout so the POS Register modal
 * sits over a dimmed, blurred “real” page (same idea as opening POS from the dashboard).
 */
const PosSessionBackdrop: React.FC = () => (
  <div
    className="fixed inset-0 z-0 flex overflow-hidden bg-slate-200"
    aria-hidden
  >
    <aside className="hidden sm:flex w-[220px] md:w-[260px] shrink-0 flex-col bg-[#0a1628] text-white/35 text-[11px] font-medium pt-6 px-4 gap-3 border-r border-white/5">
      <div className="h-8 w-24 rounded bg-white/10 mb-4" />
      {['Dashboard', 'Products', 'People', 'Warehouse', 'Sale', 'Reports', 'Settings'].map((label) => (
        <div key={label} className="flex items-center gap-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span>{label}</span>
        </div>
      ))}
    </aside>
    <div className="flex-1 flex flex-col min-w-0 bg-slate-100">
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-4 gap-4">
        <div className="h-8 flex-1 max-w-md rounded-lg bg-slate-100 border border-slate-200/80" />
        <div className="h-9 w-20 rounded-lg bg-[#0c2340]" />
        <div className="h-9 w-9 rounded-full bg-slate-200" />
      </header>
      <main className="p-4 md:p-6 flex flex-col gap-4 flex-1 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[88px] rounded-xl bg-gradient-to-br from-sky-50 via-white to-slate-50 border border-sky-100/70 shadow-sm"
            />
          ))}
        </div>
        <div className="flex-1 min-h-[160px] rounded-xl bg-white border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-100/90 to-transparent" />
          <div className="absolute inset-x-8 bottom-8 h-px bg-slate-200" />
          <div className="absolute inset-x-8 bottom-12 h-16 border-l border-b border-slate-200/80 rounded-bl-md" />
        </div>
      </main>
    </div>
  </div>
);

export default PosSessionBackdrop;
