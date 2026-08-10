import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import UnsavedChangesDialog from "./UnsavedChangesDialog.svelte";

type DialogProps = {
  open: boolean;
  title: string;
  message: string;
  saveLabel: string;
  discardLabel: string;
  cancelLabel: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

function setup(overrides: Partial<DialogProps> = {}) {
  const handlers = {
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onCancel: vi.fn(),
  };
  render(UnsavedChangesDialog, {
    props: {
      open: true,
      title: "Unsaved changes",
      message: "Save changes to notes.md before closing this tab?",
      saveLabel: "Save",
      discardLabel: "Don't Save",
      cancelLabel: "Cancel",
      ...handlers,
      ...overrides,
    },
  });
  return handlers;
}

describe("UnsavedChangesDialog", () => {
  it("renders an accessible alertdialog with title, message, and all three buttons", async () => {
    setup();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "unsaved-dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "unsaved-dialog-message");
    expect(screen.getByText("Unsaved changes")).toHaveAttribute("id", "unsaved-dialog-title");
    expect(screen.getByText("Save changes to notes.md before closing this tab?")).toHaveAttribute(
      "id",
      "unsaved-dialog-message",
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Don't Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    // Focus lands on the neutral Cancel button, never on the destructive one.
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Don't Save" })).not.toHaveFocus();
  });

  it("calls onSave once when Save is clicked", async () => {
    const { onSave } = setup();

    await fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calls onDiscard once when Don't Save is clicked", async () => {
    const { onDiscard } = setup();

    await fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));

    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("calls onCancel once when Cancel is clicked", async () => {
    const { onCancel } = setup();

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("activates Cancel on Escape without letting the key reach the window", async () => {
    const { onCancel } = setup();
    const windowKeydown = vi.fn();
    window.addEventListener("keydown", windowKeydown);

    await fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(windowKeydown).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowKeydown);
  });

  it("activates Cancel on a backdrop pointer down but not on the card itself", async () => {
    const { onCancel } = setup();
    const backdrop = document.querySelector<HTMLElement>(".dialog-backdrop");
    expect(backdrop).not.toBeNull();

    await fireEvent.pointerDown(screen.getByRole("alertdialog"));
    expect(onCancel).not.toHaveBeenCalled();

    await fireEvent.pointerDown(backdrop as HTMLElement);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders nothing when open is false", () => {
    setup({ open: false });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });
});
