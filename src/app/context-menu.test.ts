import { describe, expect, it, vi } from "vitest";

import {
  buildContextMenu,
  classifyContextTarget,
  type ContextMenuActions,
  type ContextMenuEntry,
} from "./context-menu";

function actions(overrides: Partial<ContextMenuActions> = {}): ContextMenuActions {
  return {
    hasDocument: true,
    editing: false,
    dirty: false,
    saving: false,
    tabCount: 1,
    outlineOpen: true,
    editor: null,
    openFile: vi.fn(),
    closeTab: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeAllTabs: vi.fn(),
    copyTabPath: vi.fn(),
    openLink: vi.fn(),
    copyText: vi.fn(),
    selectAllRegion: vi.fn(),
    fieldCut: vi.fn(),
    fieldCopy: vi.fn(),
    fieldPaste: vi.fn(),
    fieldSelectAll: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    toggleEditing: vi.fn(),
    toggleOutline: vi.fn(),
    toggleTheme: vi.fn(),
    ...overrides,
  };
}

function labels(entries: ContextMenuEntry[]) {
  return entries.flatMap((entry) => (entry.kind === "item" ? [entry.label] : []));
}

function find(entries: ContextMenuEntry[], id: string) {
  return entries.find((entry) => entry.kind === "item" && entry.id === id);
}

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe("classifyContextTarget", () => {
  it("recognises a tab by its document id", () => {
    const host = mount(`<div class="tab-item" data-tab-id="doc-1"><button>notes.md</button></div>`);

    const target = classifyContextTarget(host.querySelector("button"), "");

    expect(target.surface).toBe("tab");
    expect(target.documentId).toBe("doc-1");
  });

  it("recognises an editable field but not a checkbox", () => {
    const host = mount(`<input type="search" /><input type="checkbox" />`);
    const [search, checkbox] = Array.from(host.querySelectorAll("input"));

    expect(classifyContextTarget(search, "").surface).toBe("field");
    expect(classifyContextTarget(search, "").field).toBe(search);
    expect(classifyContextTarget(checkbox, "").surface).toBe("app");
  });

  it("recognises the CodeMirror editor", () => {
    const host = mount(
      `<div class="editor-host"><div class="cm-editor"><span>#</span></div></div>`,
    );

    expect(classifyContextTarget(host.querySelector("span"), "").surface).toBe("editor");
  });

  it("carries the link and region of a rendered document", () => {
    const host = mount(
      `<article class="markdown-document"><p><a href="https://example.com">docs</a></p></article>`,
    );

    const target = classifyContextTarget(host.querySelector("a"), "  docs  ");

    expect(target.surface).toBe("document");
    expect(target.linkHref).toBe("https://example.com");
    expect(target.region).toBe(host.querySelector("article"));
    expect(target.selectionText).toBe("  docs  ");
  });

  it("treats a whitespace-only selection as no selection", () => {
    const host = mount(`<article class="markdown-document"><p>text</p></article>`);

    expect(classifyContextTarget(host.querySelector("p"), "\n  ").selectionText).toBe("");
  });

  it("falls back to the application surface", () => {
    const host = mount(`<footer><span>Ready</span></footer>`);

    expect(classifyContextTarget(host.querySelector("span"), "").surface).toBe("app");
  });
});

describe("buildContextMenu", () => {
  it("offers tab commands and disables closing others for a lone tab", () => {
    const target = { surface: "tab" as const, selectionText: "", documentId: "doc-1" };

    const entries = buildContextMenu(target, actions({ tabCount: 1 }));

    expect(labels(entries)).toEqual([
      "Close tab",
      "Close other tabs",
      "Close all tabs",
      "Copy file path",
    ]);
    expect(find(entries, "tab-close-others")).toMatchObject({ disabled: true });
    expect(
      find(buildContextMenu(target, actions({ tabCount: 2 })), "tab-close-others"),
    ).toMatchObject({ disabled: false });
  });

  it("disables copy without a selection and offers link commands on a link", () => {
    const region = document.createElement("article");

    const plain = buildContextMenu({ surface: "document", selectionText: "", region }, actions());
    expect(find(plain, "document-copy")).toMatchObject({ disabled: true });
    expect(find(plain, "link-open")).toBe(undefined);

    const onLink = buildContextMenu(
      { surface: "document", selectionText: "docs", region, linkHref: "#intro" },
      actions(),
    );
    expect(find(onLink, "document-copy")).toMatchObject({ disabled: false });
    expect(find(onLink, "link-open")).toMatchObject({ label: "Go to section" });
  });

  it("routes the document commands to their actions", () => {
    const region = document.createElement("article");
    const handlers = actions();

    const entries = buildContextMenu(
      { surface: "document", selectionText: "copied", region, linkHref: "https://example.com" },
      handlers,
    );
    for (const entry of entries) {
      if (entry.kind === "item" && !entry.disabled) entry.run();
    }

    expect(handlers.openLink).toHaveBeenCalledWith("https://example.com");
    expect(handlers.copyText).toHaveBeenCalledWith("https://example.com");
    expect(handlers.copyText).toHaveBeenCalledWith("copied");
    expect(handlers.selectAllRegion).toHaveBeenCalledWith(region);
    expect(handlers.find).toHaveBeenCalledOnce();
    expect(handlers.toggleEditing).toHaveBeenCalledOnce();
    expect(handlers.toggleOutline).toHaveBeenCalledOnce();
    expect(handlers.openFile).toHaveBeenCalledOnce();
  });

  it("mirrors the editor selection and dirty state", () => {
    const editor = {
      hasSelection: vi.fn().mockReturnValue(false),
      cut: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
      selectAll: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      find: vi.fn(),
      commandPalette: vi.fn(),
    };

    const clean = buildContextMenu(
      { surface: "editor", selectionText: "" },
      actions({ editor, editing: true, dirty: false }),
    );
    expect(find(clean, "editor-cut")).toMatchObject({ disabled: true });
    expect(find(clean, "editor-paste")).toMatchObject({ disabled: false });
    expect(find(clean, "editor-save")).toMatchObject({ disabled: true });

    editor.hasSelection.mockReturnValue(true);
    const dirty = buildContextMenu(
      { surface: "editor", selectionText: "" },
      actions({ editor, editing: true, dirty: true }),
    );
    expect(find(dirty, "editor-cut")).toMatchObject({ disabled: false });
    expect(find(dirty, "editor-save")).toMatchObject({ disabled: false });
  });

  it("labels the outline toggle by its current state", () => {
    const region = document.createElement("article");
    const open = buildContextMenu(
      { surface: "document", selectionText: "", region },
      actions({ outlineOpen: true }),
    );
    const closed = buildContextMenu(
      { surface: "document", selectionText: "", region },
      actions({ outlineOpen: false }),
    );

    expect(find(open, "document-outline")).toMatchObject({ label: "Hide outline" });
    expect(find(closed, "document-outline")).toMatchObject({ label: "Show outline" });
  });

  it("dims document commands when nothing is open", () => {
    const entries = buildContextMenu(
      { surface: "app", selectionText: "" },
      actions({ hasDocument: false }),
    );

    expect(find(entries, "app-open")).toMatchObject({ disabled: undefined });
    expect(find(entries, "app-find")).toMatchObject({ disabled: true });
    expect(find(entries, "app-outline")).toMatchObject({ disabled: true });
  });

  it("never emits a leading, trailing or repeated separator", () => {
    const surfaces: ContextMenuEntry[][] = [
      buildContextMenu({ surface: "tab", selectionText: "", documentId: "doc-1" }, actions()),
      buildContextMenu({ surface: "editor", selectionText: "" }, actions()),
      buildContextMenu({ surface: "outline", selectionText: "" }, actions()),
      buildContextMenu({ surface: "app", selectionText: "" }, actions()),
      buildContextMenu(
        { surface: "document", selectionText: "", region: document.createElement("article") },
        actions(),
      ),
    ];

    for (const entries of surfaces) {
      expect(entries.at(0)?.kind).toBe("item");
      expect(entries.at(-1)?.kind).toBe("item");
      expect(
        entries.some(
          (entry, index) => entry.kind === "separator" && entries[index + 1]?.kind === "separator",
        ),
      ).toBe(false);
    }
  });
});
