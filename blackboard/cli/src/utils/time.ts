/**
 * Utility functions for timestamp formatting and timezone conversion.
 */

/**
 * Formats a UTC timestamp string from the database to local time.
 * Database stores timestamps as "YYYY-MM-DD HH:MM:SS" in UTC (no 'Z' suffix).
 * This function converts it to local timezone.
 *
 * @param utcTimestamp - UTC timestamp from database (e.g., "2026-01-25 06:55:10")
 * @returns Local time string in ISO format (e.g., "2026-01-24T22:55:10-08:00")
 */
export function utcToLocal(utcTimestamp: string): Date {
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC
  // We need to append 'Z' to tell JavaScript this is UTC
  const utcDate = new Date(utcTimestamp + "Z");
  return utcDate;
}

/**
 * Formats a UTC timestamp to local time string (HH:MM:SS).
 *
 * @param utcTimestamp - UTC timestamp from database
 * @returns Local time string (e.g., "14:55:10")
 */
export function formatLocalTime(utcTimestamp: string): string {
  const localDate = utcToLocal(utcTimestamp);
  return localDate.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Formats a UTC timestamp to local datetime string.
 *
 * @param utcTimestamp - UTC timestamp from database
 * @returns Local datetime string (e.g., "2026-01-24 14:55:10")
 */
export function formatLocalDateTime(utcTimestamp: string): string {
  const localDate = utcToLocal(utcTimestamp);
  return localDate.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2');
}

/**
 * Create relative time string from UTC timestamp.
 *
 * @param utcTimestamp - UTC timestamp from database
 * @returns Relative time string (e.g., "5m ago", "2h ago")
 */
export function relativeTime(utcTimestamp: string): string {
  const date = utcToLocal(utcTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older dates, show the date in local timezone
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
