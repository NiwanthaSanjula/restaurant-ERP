import React from 'react';

interface PaginationProps {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (limit: number) => void;
  itemsPerPageOptions?: number[];
  hideWhenEmpty?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 25, 50, 100],
  hideWhenEmpty = false
}) => {
  if (hideWhenEmpty && totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted">
        {start}-{end} of {totalItems}
      </div>

      <div className="flex items-center gap-3">
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange && onItemsPerPageChange(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          {itemsPerPageOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            {'<<'}
          </button>
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            {'<'}
          </button>
          <span className="px-3 py-1 border rounded">{currentPage}</span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            {'>'}
          </button>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            {'>>'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
