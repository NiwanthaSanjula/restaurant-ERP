export const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

const parseDateValue = (value?: string | number | Date | null) => {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;

  // IMPORTANT: `new Date("YYYY-MM-DD")` treats date-only strings as UTC midnight.
  // When toLocaleDateString() converts UTC→local, timezones *west* of UTC (e.g. UTC-5)
  // shift midnight backwards to the previous evening — causing an off-by-one error.
  // Fix: detect date-only strings and construct using the local-time overload
  // `new Date(year, month, day)`, which sets local midnight with no UTC conversion.
  // Full datetime strings (containing 'T' or 'Z') still go through the standard path
  // because they carry explicit timezone info and SHOULD be converted to local time.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day); // local midnight — no UTC shift
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value?: string | number | Date | null): string => {
  const date = parseDateValue(value);
  return date ? date.toLocaleDateString('en-GB', DATE_FORMAT_OPTIONS) : '';
};

export const formatDateTime = (value?: string | number | Date | null): string => {
  const date = parseDateValue(value);
  return date ? date.toLocaleString('en-GB', { ...DATE_FORMAT_OPTIONS, ...TIME_FORMAT_OPTIONS }) : '';
};

export const formatTime = (value?: string | number | Date | null): string => {
  const date = parseDateValue(value);
  return date ? date.toLocaleTimeString('en-GB', TIME_FORMAT_OPTIONS) : '';
};

export const toBusinessDateInputValue = (value?: string | number | Date | null): string => {
  const date = parseDateValue(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
