import { LazyStore } from "@tauri-apps/plugin-store";

import type {
  AppPreferences,
  ContentFont,
  RecentFile,
  ThemePreference,
} from "../documents/document-types";
import type { LocalePreference } from "../i18n/i18n.svelte";

/**
 * The single source of truth for preference defaults. `LazyStore` reads the same object, and
 * `sanitizePreferences` falls back to these values field by field, so the defaults live in one
 * place rather than being duplicated across the loader.
 */
export const PREFERENCE_DEFAULTS: AppPreferences = {
  theme: "system",
  locale: "system",
  recentFiles: [],
  updateChecksEnabled: true,
  contentFontSize: 1.04,
  contentWidth: 48,
  contentFont: "serif",
  outlineOpenByDefault: true,
  editorSplitPercent: 50,
  restoreTabsOnLaunch: false,
  lastOpenPaths: [],
};

const preferencesStore = new LazyStore("preferences.json", {
  autoSave: 100,
  // The store types its defaults as an index signature; AppPreferences is a closed interface,
  // so the cast is purely to satisfy that without weakening the exported constant.
  defaults: PREFERENCE_DEFAULTS as unknown as Record<string, unknown>,
});

export async function loadPreferences(): Promise<AppPreferences> {
  const entries = await preferencesStore.entries();
  return sanitizePreferences(Object.fromEntries(entries));
}

/**
 * Persist a single preference. The returned promise is intentionally fire-and-forget at every
 * call site: a failed write is never fatal to reading, so callers swallow the rejection.
 */
export function savePreference<K extends keyof AppPreferences>(
  key: K,
  value: AppPreferences[K],
): Promise<void> {
  return preferencesStore.set(key, value);
}

/**
 * Coerce untrusted stored data into a well-formed `AppPreferences`. Each field is validated and
 * numeric ranges clamped, so a corrupt or old `preferences.json` (where `theme: "light"` is still
 * legal) never breaks the app.
 */
export function sanitizePreferences(raw: unknown): AppPreferences {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    theme: sanitizeThemePreference(value.theme),
    locale: sanitizeLocalePreference(value.locale),
    recentFiles: sanitizeRecentFiles(value.recentFiles),
    updateChecksEnabled:
      typeof value.updateChecksEnabled === "boolean"
        ? value.updateChecksEnabled
        : PREFERENCE_DEFAULTS.updateChecksEnabled,
    contentFontSize: clampNumber(
      value.contentFontSize,
      0.85,
      1.4,
      PREFERENCE_DEFAULTS.contentFontSize,
    ),
    contentWidth: clampNumber(value.contentWidth, 36, 72, PREFERENCE_DEFAULTS.contentWidth),
    contentFont: sanitizeContentFont(value.contentFont),
    outlineOpenByDefault:
      typeof value.outlineOpenByDefault === "boolean"
        ? value.outlineOpenByDefault
        : PREFERENCE_DEFAULTS.outlineOpenByDefault,
    editorSplitPercent: clampNumber(
      value.editorSplitPercent,
      20,
      80,
      PREFERENCE_DEFAULTS.editorSplitPercent,
    ),
    restoreTabsOnLaunch:
      typeof value.restoreTabsOnLaunch === "boolean"
        ? value.restoreTabsOnLaunch
        : PREFERENCE_DEFAULTS.restoreTabsOnLaunch,
    lastOpenPaths: sanitizeStringArray(value.lastOpenPaths),
  };
}

function sanitizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : PREFERENCE_DEFAULTS.theme;
}

function sanitizeLocalePreference(value: unknown): LocalePreference {
  return value === "en" || value === "zh" || value === "system"
    ? value
    : PREFERENCE_DEFAULTS.locale;
}

function sanitizeContentFont(value: unknown): ContentFont {
  return value === "serif" || value === "sans" ? value : PREFERENCE_DEFAULTS.contentFont;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function sanitizeRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is RecentFile =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as RecentFile).path === "string" &&
        typeof (item as RecentFile).name === "string" &&
        typeof (item as RecentFile).lastOpenedMs === "number",
    )
    .slice(0, 10);
}
