import { LazyStore } from "@tauri-apps/plugin-store";

import type { AppPreferences, RecentFile, Theme } from "../documents/document-types";

const preferencesStore = new LazyStore("preferences.json", {
  autoSave: 100,
  defaults: {
    theme: "light",
    recentFiles: [],
    updateChecksEnabled: true,
  },
});

export async function loadPreferences(): Promise<AppPreferences> {
  const [theme, recentFiles, updateChecksEnabled] = await Promise.all([
    preferencesStore.get<Theme>("theme"),
    preferencesStore.get<RecentFile[]>("recentFiles"),
    preferencesStore.get<boolean>("updateChecksEnabled"),
  ]);

  return {
    theme: theme === "dark" ? "dark" : "light",
    recentFiles: sanitizeRecentFiles(recentFiles),
    updateChecksEnabled: updateChecksEnabled !== false,
  };
}

export async function saveTheme(theme: Theme): Promise<void> {
  await preferencesStore.set("theme", theme);
}

export async function saveRecentFiles(recentFiles: RecentFile[]): Promise<void> {
  await preferencesStore.set("recentFiles", sanitizeRecentFiles(recentFiles));
}

export async function saveUpdateChecksEnabled(enabled: boolean): Promise<void> {
  await preferencesStore.set("updateChecksEnabled", enabled);
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
