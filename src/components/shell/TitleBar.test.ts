import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no Tauri native window; the module is mocked so every native interaction
// can be asserted on spy functions instead.
const nativeWindow = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  startDragging: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: nativeWindow.minimize,
    toggleMaximize: nativeWindow.toggleMaximize,
    close: nativeWindow.close,
    destroy: nativeWindow.destroy,
    startDragging: nativeWindow.startDragging,
    isMaximized: nativeWindow.isMaximized,
    onResized: nativeWindow.onResized,
  }),
}));

import TitleBar from "./TitleBar.svelte";

function dragZone(): HTMLElement {
  const zone = document.querySelector<HTMLElement>(".title-bar-drag-zone");
  if (!zone) throw new Error("drag zone not rendered");
  return zone;
}

describe("TitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeWindow.isMaximized.mockResolvedValue(false);
    nativeWindow.onResized.mockResolvedValue(vi.fn());
  });

  it("renders the app name, app icon, and the three window controls", () => {
    render(TitleBar);

    expect(screen.getByText("LitheMark")).toBeInTheDocument();
    expect(document.querySelector(".title-bar-brand img.app-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("minimizes through the native window", async () => {
    render(TitleBar);

    await fireEvent.click(screen.getByRole("button", { name: "Minimize" }));

    expect(nativeWindow.minimize).toHaveBeenCalledTimes(1);
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
  });

  it("maximizes through the native window", async () => {
    render(TitleBar);

    await fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    expect(nativeWindow.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
  });

  it("closes through close() and never destroys the window", async () => {
    render(TitleBar);

    await fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(nativeWindow.close).toHaveBeenCalledTimes(1);
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
  });

  it("refreshes the maximize state after toggling", async () => {
    nativeWindow.toggleMaximize.mockImplementation(() => {
      nativeWindow.isMaximized.mockResolvedValue(true);
      return Promise.resolve();
    });
    render(TitleBar);

    await fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("shows the restore control when the window is already maximized", async () => {
    nativeWindow.isMaximized.mockResolvedValue(true);
    render(TitleBar);

    expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("starts dragging on a single left click over the drag zone", async () => {
    render(TitleBar);

    await fireEvent.mouseDown(dragZone(), { button: 0, detail: 1 });

    expect(nativeWindow.startDragging).toHaveBeenCalledTimes(1);
    expect(nativeWindow.toggleMaximize).not.toHaveBeenCalled();
  });

  it("toggles maximize on a double click over the drag zone", async () => {
    render(TitleBar);

    await fireEvent.mouseDown(dragZone(), { button: 0, detail: 2 });

    expect(nativeWindow.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(nativeWindow.startDragging).not.toHaveBeenCalled();
  });

  it("ignores non-left mouse buttons on the drag zone", async () => {
    render(TitleBar);

    await fireEvent.mouseDown(dragZone(), { button: 2, detail: 1 });

    expect(nativeWindow.startDragging).not.toHaveBeenCalled();
    expect(nativeWindow.toggleMaximize).not.toHaveBeenCalled();
  });

  it("listens to window resize events to keep the icon in sync", () => {
    render(TitleBar);

    expect(nativeWindow.onResized).toHaveBeenCalledTimes(1);
  });
});
