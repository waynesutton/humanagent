/**
 * Lightweight datetime utilities for the entire app.
 * No DB queries, no token overhead. Uses browser Intl APIs.
 */

/** Returns the user's IANA timezone (e.g. "America/Los_Angeles") */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Relative time label: "now", "2m", "3h", "5d", "2w", "3mo" */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return "now";
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < week) return `${Math.floor(diff / day)}d`;
  if (diff < month) return `${Math.floor(diff / week)}w`;
  return `${Math.floor(diff / month)}mo`;
}

/** Human-readable duration: "< 0.1s", "1.2s", "1m 5s", "2h 10m" */
export function formatDuration(ms: number): string {
  if (ms < 100) return "< 0.1s";
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/** Locale-aware date/time string with user timezone */
export function formatDateTime(timestamp: number, options?: {
  dateOnly?: boolean;
  timeOnly?: boolean;
}): string {
  const tz = getUserTimezone();
  if (options?.timeOnly) {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (options?.dateOnly) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return new Date(timestamp).toLocaleString(undefined, {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Returns a one-liner context string for agent system prompts.
 * Zero DB cost, minimal token overhead (~15 tokens).
 * Example: "Current date/time: Wednesday, Feb 18, 2026 3:42 PM PST"
 */
export function getLocalDateContext(): string {
  const tz = getUserTimezone();
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `Current date/time: ${formatted}`;
}

/**
 * Structured datetime context for programmatic use.
 * No DB or network calls.
 */
export function getDateContext(): {
  date: string;
  time: string;
  timezone: string;
  dayOfWeek: string;
  isoString: string;
} {
  const tz = getUserTimezone();
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }),
    time: now.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }),
    timezone: tz,
    dayOfWeek: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" }),
    isoString: now.toISOString(),
  };
}
