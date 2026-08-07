import { describe, expect, it } from "vitest";

import { formatBytes, formatRelativeTime } from "./format";

describe("formatBytes", () => {
  it("renders bytes below a kilobyte verbatim", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("renders kilobytes and megabytes with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000;

  it("describes a recent past timestamp in minutes", () => {
    expect(formatRelativeTime(now - 5 * 60_000, "en", now)).toBe("5 minutes ago");
    expect(formatRelativeTime(now - 60_000, "en", now)).toBe("1 minute ago");
  });

  it("describes older timestamps in hours and days", () => {
    expect(formatRelativeTime(now - 2 * 3_600_000, "en", now)).toBe("2 hours ago");
    expect(formatRelativeTime(now - 3 * 86_400_000, "en", now)).toBe("3 days ago");
  });

  it("localizes into Chinese", () => {
    expect(formatRelativeTime(now - 5 * 60_000, "zh", now)).toBe("5分钟前");
    expect(formatRelativeTime(now - 3 * 86_400_000, "zh", now)).toBe("3天前");
  });

  it("falls back to seconds for very recent timestamps", () => {
    expect(formatRelativeTime(now - 10_000, "en", now)).toBe("10 seconds ago");
  });
});
