import React, { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  /** Merged into the input element (border, radius, etc.) */
  inputClassName?: string;
  value?: string; // Controlled value prop
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearch, 
  placeholder = 'Search...', 
  debounceMs = 300,
  className = '',
  inputClassName = '',
  value: controlledValue
}) => {
  // Use controlled value if provided, otherwise use internal state
  const isControlled = controlledValue !== undefined;
  const [internalQuery, setInternalQuery] = useState(controlledValue || '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Sync internal state with controlled value when it changes externally
  useEffect(() => {
    if (isControlled && controlledValue !== undefined) {
      setInternalQuery(controlledValue);
    }
  }, [controlledValue, isControlled]);
  
  // Current query value (controlled or internal) - display value
  const currentQuery = isControlled ? controlledValue : internalQuery;
  
  // Debounced search effect - uses internalQuery for debouncing
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer - use internalQuery for debouncing
    debounceTimerRef.current = setTimeout(() => {
      onSearch(internalQuery);
    }, debounceMs);

    // Cleanup on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [internalQuery, onSearch, debounceMs]);

  const handleChange = (newValue: string) => {
    // Always update internalQuery for debouncing
    setInternalQuery(newValue);
  };

  const handleClear = () => {
    if (isControlled) {
      onSearch('');
    } else {
      setInternalQuery('');
      onSearch('');
    }
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg 
            className="h-5 w-5 text-gray-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
            />
          </svg>
        </div>
        <input
          type="text"
          value={currentQuery}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          title={placeholder}
          className={`block w-full min-w-0 pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-[#003366] focus:border-transparent text-xs sm:text-sm placeholder:text-xs sm:placeholder:text-sm ${inputClassName}`.trim()}
        />
        {currentQuery && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
              aria-label="Clear search"
            >
              <svg 
                className="h-5 w-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M6 18L18 6M6 6l12 12" 
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchBar;

