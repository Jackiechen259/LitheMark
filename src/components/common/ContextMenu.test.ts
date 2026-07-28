import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import type { ContextMenuEntry } from "../../app/context-menu";
import ContextMenu from "./ContextMenu.svelte";

function entries(run = vi.fn()): ContextMenuEntry[] {
  return [
    { kind: "item", id: "copy", label: "Copy", hint: "Ctrl+C", run },
    { kind: "item", id: "cut", label: "Cut", disabled: true, run: vi.fn() },
    { kind: "separator" },
    { kind: "item", id: "open", label: "Open file…", hint: "Ctrl+O", run: vi.fn() },
  ];
}

describe("ContextMenu", () => {
  it("renders every item with its shortcut hint and focuses the first one", async () => {
    render(ContextMenu, { props: { x: 20, y: 30, entries: entries(), onClose: vi.fn() } });

    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveTextContent("Ctrl+C");
    expect(screen.getByRole("menuitem", { name: /Cut/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus());
  });

  it("positions itself at the requested point", async () => {
    render(ContextMenu, { props: { x: 120, y: 240, entries: entries(), onClose: vi.fn() } });

    await waitFor(() =>
      expect(screen.getByRole("menu")).toHaveStyle({ left: "120px", top: "240px" }),
    );
  });

  it("skips disabled items while moving with the arrow keys", async () => {
    render(ContextMenu, { props: { x: 0, y: 0, entries: entries(), onClose: vi.fn() } });
    const menu = screen.getByRole("menu");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus());

    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Open file/ })).toHaveFocus();

    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus();

    await fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: /Open file/ })).toHaveFocus();
  });

  it("runs a command and closes on activation", async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(ContextMenu, { props: { x: 0, y: 0, entries: entries(run), onClose } });

    await fireEvent.click(screen.getByRole("menuitem", { name: /Copy/ }));

    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape without letting the key reach the app", async () => {
    const onClose = vi.fn();
    const windowKeydown = vi.fn();
    window.addEventListener("keydown", windowKeydown);
    render(ContextMenu, { props: { x: 0, y: 0, entries: entries(), onClose } });

    await fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    expect(windowKeydown).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowKeydown);
  });

  it("closes when a pointer goes down outside and stays open inside", async () => {
    const onClose = vi.fn();
    render(ContextMenu, { props: { x: 0, y: 0, entries: entries(), onClose } });

    await fireEvent.pointerDown(screen.getByRole("menuitem", { name: /Copy/ }));
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
