import React, { useEffect, useRef, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';

interface SearchableDropdownProps {
  value: string;
  onChange: (value: any) => void;
  onSearch: (query: string) => Promise<any[]>;
  placeholder?: string;
  required?: boolean;
  id?: string;
  className?: string;
  label?: string;
  labelClassName?: string;
  showRequiredIndicator?: boolean;
  clearOnSelect?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  value,
  onChange,
  onSearch,
  placeholder = 'Search...',
  required = false,
  id,
  className = '',
  label,
  labelClassName = 'block text-sm font-medium text-foreground mb-2',
  showRequiredIndicator = false,
  clearOnSelect = false
}) => {
  useCurrency();
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
    // Reset dropdown state when value becomes empty (e.g., when row is cleared)
    if (!value || value.trim() === '') {
      setOptions([]);
      setIsOpen(false);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const performSearch = async (searchQuery: string) => {
    if (searchQuery.trim().length === 0) {
      setOptions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const results = await onSearch(searchQuery);
      setOptions(Array.isArray(results) ? results : []);
      setIsOpen(Array.isArray(results) && results.length > 0);
    } catch (error) {
      console.error("Search error:", error);
      setOptions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (newQuery.trim().length === 0) {
      setOptions([]);
      setIsOpen(false);
      return;
    }
    
    debounceTimerRef.current = setTimeout(() => {
      performSearch(newQuery);
    }, 300);
  };

  const handleSelect = (option: any) => {
    if (clearOnSelect) {
      setQuery('');
    } else {
      const displayText = typeof option === 'string' ? option : option?.name || '';
      setQuery(displayText);
    }
    
    onChange(option);
    setIsOpen(false);
    setOptions([]);
  };

  const handleFocus = () => {
    if (query.trim().length > 0 && options.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      {label && (
        <label className={labelClassName}>
          {label} {showRequiredIndicator && <span className="text-danger">*</span>}
        </label>
      )}
      <input
        id={id}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        required={required}
        placeholder={placeholder}
        className={`w-full px-4 py-3 border-2 border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-bold text-foreground ${className}`}
      />
      
      {}
      {isOpen && (
        <div className="absolute z-[9999] w-full mt-1 bg-surface border-2 border-line-strong rounded-xl shadow-elevated max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-muted font-bold italic animate-pulse">Searching...</div>
          ) : options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted font-bold">No results found</div>
          ) : (
            options.map((option, index) => (
              <div
                key={index}
                onClick={() => handleSelect(option)}
                className="px-4 py-3 text-sm text-foreground font-bold hover:bg-primary-hover hover:text-on-primary cursor-pointer transition-colors border-b last:border-0 border-line"
              >
                {typeof option === 'string' ? (
                  option
                ) : (
                  <div className="flex items-center gap-3">
                    {/* Product Image Placeholder/Thumbnail */}
                    <div className="w-10 h-10 rounded-lg bg-surface-muted flex items-center justify-center text-primary shrink-0 border border-line">
                      {option.image ? (
                        <img src={option.image} alt={option.name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="font-black text-xs uppercase">{option.name?.substring(0, 2)}</div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-primary truncate block">{option.name}</span>
                        {option.price != null && (
                          <span className="text-[10px] font-black bg-primary-soft text-primary px-2 py-0.5 rounded-full whitespace-nowrap ml-2">
                            LKR {Number(option.price).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-tighter">
                          Code: {option.code || 'N/A'}
                        </span>
                        {option.stock !== undefined && (
                          <span className={`text-[10px] font-black uppercase tracking-tighter ${Number(option.stock) > 0 ? 'text-secondary' : 'text-danger'}`}>
                            Stock: {Number(option.stock).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;