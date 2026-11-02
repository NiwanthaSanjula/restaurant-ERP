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
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-[500px] rounded-2xl shadow-elevated p-8 flex flex-col items-center text-center">
        <h3 className="text-xl font-bold text-foreground mb-2">
          {title || 'Are you sure you want to delete this item?'}
        </h3>
        <div className="mb-8">
          {message ? (
            <p className="text-muted text-sm">{message}</p>
          ) : (
            <p className="text-muted text-sm">
              Item: <span className="font-semibold text-foreground">{itemName || ''}</span>
            </p>
          )}
          <p className="text-danger text-xs mt-1 italic">
            ⚠ This action cannot be undone.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row-reverse gap-3 w-full">
          <button 
            onClick={onConfirm} 
            className="flex-1 px-6 py-3 rounded-xl bg-danger text-on-danger font-bold hover:bg-danger-hover transition-colors shadow-danger-line"
          >
            Yes, Delete
          </button>
          <button 
            onClick={onCancel} 
            className="flex-1 px-6 py-3 rounded-xl bg-surface-muted text-muted font-semibold hover:bg-surface-muted transition-colors"
          >
            No, Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
