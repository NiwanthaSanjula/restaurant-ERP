import React from 'react';

const Loader: React.FC<{ text?: string }> = ({ text }) => {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow px-6 py-4 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-[#003366] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[#001F54] text-sm font-medium">{text || 'Loading...'}</div>
      </div>
    </div>
  );
};

export default Loader;


