export const TIMEZONE = 'Asia/Colombo';

export interface ColomboDayRange {
  startUtc: Date;
  endUtc: Date;
}

/**
 * Extracts the calendar date string (YYYY-MM-DD) for a given date in Asia/Colombo.
 */
export function getColomboDateString(date: Date | string | number = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Formats a given timestamp in Asia/Colombo timezone.
 * Example output: "02 Oct 2026, 10:30:00 PM"
 */
export function formatColomboTimestamp(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...options,
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(d);
}

/**
 * Formats a given date to a localized date string in Asia/Colombo.
 * Example output: "02 Oct 2026"
 */
export function formatColomboDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(d);
}

/**
 * Formats a given timestamp to time only in Asia/Colombo.
 * Example output: "10:30 PM"
 */
export function formatColomboTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Returns the UTC start and end Date boundaries for any given date in Asia/Colombo (UTC+05:30).
 * Defaults to "today" in Asia/Colombo if no date is provided.
 *
 * Example:
 * For 2026-10-02 in Asia/Colombo:
 * startUtc: 2026-10-01T18:30:00.000Z
 * endUtc:   2026-10-02T18:29:59.999Z
 */
export function getColomboDayRange(date?: Date | string | number): ColomboDayRange {
  let dateStr: string;

  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    dateStr = date.trim();
  } else {
    dateStr = getColomboDateString(date ?? new Date());
  }

  const startUtc = new Date(`${dateStr}T00:00:00.000+05:30`);
  const endUtc = new Date(`${dateStr}T23:59:59.999+05:30`);

  return {
    startUtc,
    endUtc,
  };
}

/**
 * Returns UTC start and end boundaries for a given date range (YYYY-MM-DD) in Asia/Colombo.
 * Defaults to "today" if dates are not provided.
 */
export function getColomboDateRange(
  startDateStr?: string | null,
  endDateStr?: string | null,
): ColomboDayRange {
  const todayStr = getColomboDateString(new Date());
  const start = startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr.trim())
    ? startDateStr.trim()
    : todayStr;
  const end = endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr.trim())
    ? endDateStr.trim()
    : start;

  const startUtc = new Date(`${start}T00:00:00.000+05:30`);
  const endUtc = new Date(`${end}T23:59:59.999+05:30`);

  return {
    startUtc,
    endUtc,
  };
}

