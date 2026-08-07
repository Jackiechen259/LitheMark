import { describe, expect, it } from "vitest";

import type { AppPreferences, RecentFile } from "../documents/document-types";
import { PREFERENCE_DEFAULTS, sanitizePreferences } from "./settings-service";

function recentFile(path: string, ms = 1): RecentFile {
  return { path, name: path.split(/[\\/]/).pop() ?? path, lastOpenedMs: ms };
}

describe("sanitizePreferences", () => {
  it("returns defaults for empty input", () => {
    expect(sanitizePreferences({})).toEqual(PREFERENCE_DEFAULTS);
    expect(sanitizePreferences(null)).toEqual(PREFERENCE_DEFAULTS);
    expect(sanitizePreferences(undefined)).toEqual(PREFERENCE_DEFAULTS);
  });

  it("accepts a valid old-version archive that only has the original three fields", () => {
    const legacy = { theme: "light", recentFiles: [], updateChecksEnabled: true };

    const result = sanitizePreferences(legacy);

    expect(result.theme).toBe("light");
    expect(result.updateChecksEnabled).toBe(true);
    expect(result.recentFiles).toEqual([]);
    // New fields fall back to defaults rather than disappearing.
    expect(result.contentWidth).toBe(PREFERENCE_DEFAULTS.contentWidth);
    expect(result.locale).toBe(PREFERENCE_DEFAULTS.locale);
  });

  it("clamps numeric fields into range", () => {
    const result = sanitizePreferences({
      contentFontSize: 0.1,
      contentWidth: 9999,
      editorSplitPercent: 200,
    });

    expect(result.contentFontSize).toBe(0.85);
    expect(result.contentWidth).toBe(72);
    expect(result.editorSplitPercent).toBe(80);
  });

  it("clamps below the minimum too", () => {
    const result = sanitizePreferences({
      contentFontSize: 5,
      contentWidth: 1,
      editorSplitPercent: -10,
    });

    expect(result.contentFontSize).toBe(1.4);
    expect(result.contentWidth).toBe(36);
    expect(result.editorSplitPercent).toBe(20);
  });

  it("drops non-numeric values back to defaults", () => {
    const result = sanitizePreferences({
      contentFontSize: "big",
      contentWidth: NaN,
      editorSplitPercent: null,
    });

    expect(result.contentFontSize).toBe(PREFERENCE_DEFAULTS.contentFontSize);
    expect(result.contentWidth).toBe(PREFERENCE_DEFAULTS.contentWidth);
    expect(result.editorSplitPercent).toBe(PREFERENCE_DEFAULTS.editorSplitPercent);
  });

  it("keeps valid enum values and rejects unknown ones", () => {
    const result = sanitizePreferences({
      theme: "dark",
      locale: "zh",
      contentFont: "sans",
    });

    expect(result.theme).toBe("dark");
    expect(result.locale).toBe("zh");
    expect(result.contentFont).toBe("sans");

    const rejected = sanitizePreferences({
      theme: "hot pink",
      locale: "ja",
      contentFont: "comic",
    });

    expect(rejected.theme).toBe(PREFERENCE_DEFAULTS.theme);
    expect(rejected.locale).toBe(PREFERENCE_DEFAULTS.locale);
    expect(rejected.contentFont).toBe(PREFERENCE_DEFAULTS.contentFont);
  });

  it("coerces booleans and keeps false values", () => {
    const result = sanitizePreferences({
      updateChecksEnabled: false,
      outlineOpenByDefault: false,
      restoreTabsOnLaunch: true,
    });

    expect(result.updateChecksEnabled).toBe(false);
    expect(result.outlineOpenByDefault).toBe(false);
    expect(result.restoreTabsOnLaunch).toBe(true);

    const nonBoolean = sanitizePreferences({
      updateChecksEnabled: "yes",
      restoreTabsOnLaunch: 1,
    });

    expect(nonBoolean.updateChecksEnabled).toBe(PREFERENCE_DEFAULTS.updateChecksEnabled);
    expect(nonBoolean.restoreTabsOnLaunch).toBe(PREFERENCE_DEFAULTS.restoreTabsOnLaunch);
  });

  it("keeps at most ten recent files and drops malformed entries", () => {
    const files = Array.from({ length: 12 }, (_, index) => recentFile(`f${index}.md`, index));
    files.push({ path: "bad" } as unknown as RecentFile, null as unknown as RecentFile);

    const result = sanitizePreferences({ recentFiles: files });

    expect(result.recentFiles).toHaveLength(10);
    expect(result.recentFiles.every((file) => typeof file.name === "string")).toBe(true);
  });

  it("filters non-string entries out of lastOpenPaths", () => {
    const result = sanitizePreferences({ lastOpenPaths: ["a.md", 3, null, "b.md"] });

    expect(result.lastOpenPaths).toEqual(["a.md", "b.md"]);
  });

  it("preserves a fully valid preferences object untouched", () => {
    const valid: AppPreferences = {
      theme: "system",
      locale: "system",
      recentFiles: [recentFile("notes.md", 100)],
      updateChecksEnabled: false,
      contentFontSize: 1.2,
      contentWidth: 52,
      contentFont: "sans",
      outlineOpenByDefault: false,
      editorSplitPercent: 40,
      restoreTabsOnLaunch: true,
      lastOpenPaths: ["notes.md"],
    };

    expect(sanitizePreferences(valid)).toEqual(valid);
  });
});
