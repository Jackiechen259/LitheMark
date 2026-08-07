/**
 * Small, dependency-free formatters shared by the home view, status bar and settings page.
 */
import type { Locale } from "../features/i18n/i18n.svelte";

/**
 * Render a past or future timestamp as a localized relative phrase ("5 minutes ago",
 * "yesterday", "in 2 days"). `now` is overridable so tests stay deterministic.
 */
export function formatRelativeTime(ms: number, locale: Locale, now = Date.now()): string {
  const diffSeconds = Math.round((ms - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const minutes = Math.round(diffSeconds / 60);
  const hours = Math.round(diffSeconds / 3600);
  const days = Math.round(diffSeconds / 86_400);

  if (Math.abs(days) >= 1) return rtf.format(days, "day");
  if (Math.abs(hours) >= 1) return rtf.format(hours, "hour");
  if (Math.abs(minutes) >= 1) return rtf.format(minutes, "minute");
  return rtf.format(diffSeconds, "second");
}

/** Render a byte count with one decimal place once it crosses a unit boundary. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
