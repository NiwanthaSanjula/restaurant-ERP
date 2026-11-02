export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Colombo';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

type DateOnlyParts = Pick<ZonedParts, 'year' | 'month' | 'day'>;

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone = APP_TIME_ZONE) => {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    formatterCache.set(timeZone, formatter);
  }

  return formatter;
};

export const getZonedParts = (date = new Date(), timeZone = APP_TIME_ZONE): ZonedParts => {
  const partMap = Object.fromEntries(
    getFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
    second: Number(partMap.second),
    weekday: WEEKDAY_MAP[partMap.weekday] ?? 0
  };
};

const getTimeZoneOffsetMs = (date: Date, timeZone = APP_TIME_ZONE) => {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds()
  );

  return asUtc - date.getTime();
};

export const zonedDateTimeToUtc = (
  parts: DateOnlyParts & Partial<Pick<ZonedParts, 'hour' | 'minute' | 'second'>>,
  millisecond = 0,
  timeZone = APP_TIME_ZONE
) => {
  const utcGuess = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    millisecond
  ));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offset);
};

export const parseDateOnlyParts = (value: string, timeZone = APP_TIME_ZONE): DateOnlyParts => {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  const { year, month, day } = getZonedParts(parsed, timeZone);
  return { year, month, day };
};

export const addDaysToDateOnlyParts = (parts: DateOnlyParts, days: number): DateOnlyParts => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};

export const formatDateOnlyParts = (parts: DateOnlyParts) => {
  const year = String(parts.year).padStart(4, '0');
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const startOfZonedDay = (parts: DateOnlyParts, timeZone = APP_TIME_ZONE) => {
  return zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, 0, timeZone);
};

export const endOfZonedDay = (parts: DateOnlyParts, timeZone = APP_TIME_ZONE) => {
  return zonedDateTimeToUtc({ ...parts, hour: 23, minute: 59, second: 59 }, 999, timeZone);
};

export const parseDateInputAsZonedStart = (
  value: string | Date | undefined | null,
  timeZone = APP_TIME_ZONE
) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;

  return startOfZonedDay(parseDateOnlyParts(value, timeZone), timeZone);
};

export const buildZonedDateRange = (
  startValue: string | undefined,
  endValue: string | undefined,
  timeZone = APP_TIME_ZONE
) => {
  const startParts = parseDateOnlyParts(startValue || endValue || '', timeZone);
  const endParts = parseDateOnlyParts(endValue || startValue || '', timeZone);

  return {
    start: startOfZonedDay(startParts, timeZone),
    end: endOfZonedDay(endParts, timeZone)
  };
};

export const getZonedTodayRange = (now = new Date(), timeZone = APP_TIME_ZONE) => {
  const { year, month, day } = getZonedParts(now, timeZone);
  const today = { year, month, day };

  return {
    today,
    start: startOfZonedDay(today, timeZone),
    end: endOfZonedDay(today, timeZone)
  };
};

export const getZonedWeekRange = (now = new Date(), timeZone = APP_TIME_ZONE) => {
  const parts = getZonedParts(now, timeZone);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  const weekStart = addDaysToDateOnlyParts(today, -parts.weekday);
  const weekEnd = addDaysToDateOnlyParts(weekStart, 6);

  return {
    weekStart,
    weekEnd,
    effectiveWeekEnd: today,
    start: startOfZonedDay(weekStart, timeZone),
    end: endOfZonedDay(today, timeZone),
    fullWeekEnd: endOfZonedDay(weekEnd, timeZone)
  };
};

export const getZonedMonthRange = (now = new Date(), timeZone = APP_TIME_ZONE) => {
  const parts = getZonedParts(now, timeZone);
  const monthStart = { year: parts.year, month: parts.month, day: 1 };
  const lastDayOfMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const monthEnd = { year: parts.year, month: parts.month, day: lastDayOfMonth };

  return {
    year: parts.year,
    month: parts.month,
    monthStart,
    monthEnd,
    start: startOfZonedDay(monthStart, timeZone),
    end: endOfZonedDay(monthEnd, timeZone)
  };
};
