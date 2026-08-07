import { describe, expect, it, vi } from "vitest";

import { handleShortcut, type ShortcutActions } from "./shortcuts";

function actions(): ShortcutActions {
  return {
    open: vi.fn(),
    closeActive: vi.fn(),
    nextTab: vi.fn(),
    previousTab: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    openSettings: vi.fn(),
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

  it("opens document search", () => {
    const handlers = actions();
    handleShortcut(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }), handlers);

    expect(handlers.find).toHaveBeenCalledOnce();
  });

  it("saves the active editor", () => {
    const handlers = actions();
    handleShortcut(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }), handlers);

    expect(handlers.save).toHaveBeenCalledOnce();
  });

  it("opens the settings view", () => {
    const handlers = actions();
    handleShortcut(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }), handlers);

    expect(handlers.openSettings).toHaveBeenCalledOnce();
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
