/**
 * date.util — lightweight date arithmetic and formatting utilities.
 *
 * Responsibility: Pure functions for common date operations used across the
 * application. No external date library dependency — uses native Date APIs only.
 *
 * Functions:
 *  addDays(date, days)              : Returns a new Date n days in the future/past.
 *                                     Used for password-reset token expiry calculation.
 *  addMinutes(date, minutes)        : Adds minutes via getTime() + ms offset.
 *                                     Useful for short-lived token expiries (15–60 min).
 *  isExpired(date)                  : Returns true if `date` is in the past.
 *                                     Guards against using stale reset/verification tokens.
 *  toISOString(date)                : Thin wrapper around Date.toISOString() for
 *                                     consistent ISO-8601 formatting in responses.
 *  formatDate(date, locale?)        : Human-readable date via Intl.DateTimeFormat
 *                                     (e.g. "January 1, 2024"). Default locale: en-US.
 *  daysDifference(from, to)         : Integer day count between two dates, floor-rounded.
 *                                     Negative if `from` is after `to`.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function isExpired(date: Date): boolean {
  return date < new Date();
}

export function toISOString(date: Date): string {
  return date.toISOString();
}

export function formatDate(date: Date, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function daysDifference(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}
