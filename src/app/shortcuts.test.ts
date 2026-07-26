import { describe, expect, it, vi } from "vitest";

import { handleShortcut, type ShortcutActions } from "./shortcuts";

function actions(): ShortcutActions {
  return {
    open: vi.fn(),
    closeActive: vi.fn(),
    nextTab: vi.fn(),
    previousTab: vi.fn(),
  };
}

describe("handleShortcut", () => {
  it("handles open and close shortcuts", () => {
    const handlers = actions();
    handleShortcut(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }), handlers);
    handleShortcut(new KeyboardEvent("keydown", { key: "w", ctrlKey: true }), handlers);

    expect(handlers.open).toHaveBeenCalledOnce();
    expect(handlers.closeActive).toHaveBeenCalledOnce();
  });

  it("cycles tabs in both directions", () => {
    const handlers = actions();
    handleShortcut(new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }), handlers);
    handleShortcut(
      new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true, shiftKey: true }),
      handlers,
    );

    expect(handlers.nextTab).toHaveBeenCalledOnce();
    expect(handlers.previousTab).toHaveBeenCalledOnce();
  });
});
