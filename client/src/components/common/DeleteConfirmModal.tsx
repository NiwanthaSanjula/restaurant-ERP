import React from 'react';

interface Props {
  itemName?: string;
  title?: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

const DeleteConfirmModal: React.FC<Props> = ({ itemName, title, message, onCancel, onConfirm }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-[500px] rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {title || 'Are you sure you want to delete this item?'}
        </h3>
        <div className="mb-8">
          {message ? (
            <p className="text-gray-500 text-sm">{message}</p>
          ) : (
            <p className="text-gray-500 text-sm">
              Item: <span className="font-semibold text-gray-800">{itemName || ''}</span>
            </p>
          )}
          <p className="text-red-600 text-xs mt-1 italic">
            ⚠ This action cannot be undone.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row-reverse gap-3 w-full">
          <button 
            onClick={onConfirm} 
            className="flex-1 px-6 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
          >
            Yes, Delete
          </button>
          <button 
            onClick={onCancel} 
            className="flex-1 px-6 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors"
          >
            No, Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
