import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import type { DocumentTab } from "../../features/documents/document-types";
import TabBar from "./TabBar.svelte";

function tab(documentId: string): DocumentTab {
  return {
    documentId,
    metadata: {
      id: documentId,
      name: `${documentId}.md`,
      displayPath: `C:\\docs\\${documentId}.md`,
      byteSize: 10,
      modifiedAtMs: 0,
      encoding: "UTF-8",
      lineCount: 1,
      mode: "full",
      blockCount: 1,
      revision: 1,
    },
    blocks: [],
    headings: [],
    indexComplete: true,
    status: "ready",
    scrollTop: 0,
    outlineExpanded: true,
  };
}

describe("TabBar", () => {
  it("uses roving focus and arrow keys to activate adjacent tabs", async () => {
    const onActivate = vi.fn();
    render(TabBar, {
      props: {
        tabs: [tab("one"), tab("two")],
        activeDocumentId: "one",
        onActivate,
        onClose: vi.fn(),
      },
    });
    const first = screen.getByRole("tab", { name: "one.md" });
    const second = screen.getByRole("tab", { name: "two.md" });

    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");
    first.focus();
    await fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(onActivate).toHaveBeenCalledWith("two");
    expect(second).toHaveFocus();
  });

  it("closes the focused tab with Delete", async () => {
    const onClose = vi.fn();
    render(TabBar, {
      props: {
        tabs: [tab("one")],
        activeDocumentId: "one",
        onActivate: vi.fn(),
        onClose,
      },
    });

    await fireEvent.keyDown(screen.getByRole("tab", { name: "one.md" }), { key: "Delete" });
    expect(onClose).toHaveBeenCalledWith("one");
  });
});
