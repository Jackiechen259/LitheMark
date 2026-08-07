import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.svelte";
import { PREFERENCE_DEFAULTS } from "../features/settings/settings-service";

const service = vi.hoisted(() => ({
  selectMarkdownFiles: vi.fn(),
  openDocument: vi.fn(),
  closeDocument: vi.fn(),
  reloadDocument: vi.fn(),
  getDocumentMetadata: vi.fn(),
  getBlocks: vi.fn(),
  getHeadings: vi.fn(),
  searchDocument: vi.fn(),
  cancelSearch: vi.fn(),
  loadLocalAsset: vi.fn(),
  checkDocumentChange: vi.fn(),
  openExternalUrl: vi.fn(),
  beginEdit: vi.fn(),
  getEditorChunk: vi.fn(),
  applyEditBatch: vi.fn(),
  previewEdit: vi.fn(),
  saveEdit: vi.fn(),
  prepareMerge: vi.fn(),
  applyMergeResult: vi.fn(),
  discardEdit: vi.fn(),
}));
const preferences = vi.hoisted(() => ({
  loadPreferences: vi.fn(),
  savePreference: vi.fn(),
}));
const updates = vi.hoisted(() => ({
  tauriUpdateGateway: {
    check: vi.fn(),
    relaunch: vi.fn(),
  },
}));

vi.mock("../features/documents/document-service", () => service);
vi.mock("../features/settings/settings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/settings/settings-service")>();
  // Keep the pure helpers (PREFERENCE_DEFAULTS, sanitizePreferences) real; only the
  // store-touching functions need stubbing in the browser test host.
  return {
    ...actual,
    loadPreferences: preferences.loadPreferences,
    savePreference: preferences.savePreference,
  };
});
vi.mock("../features/updates/update-service", () => updates);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

function openResult(id: string, name: string, html = "<h1>Hello</h1><p>Safe content</p>") {
  return {
    document: {
      id,
      name,
      displayPath: `C:\\notes\\${name}`,
      byteSize: 128,
      modifiedAtMs: 0,
      encoding: "UTF-8",
      lineCount: 2,
      mode: "full" as const,
      blockCount: 1,
      revision: 1,
    },
    initialBlocks: [
      {
        id: 0,
        kind: "heading" as const,
        sourceStart: 0,
        sourceEnd: 8,
        estimatedHeight: 64,
        html,
        plainText: name,
      },
    ],
    headings: [{ blockId: 0, level: 1, text: name, slug: `heading-${id}` }],
    indexComplete: true,
    reused: false,
  };
}

describe("App", () => {
  beforeEach(() => {
    Object.values(service).forEach((mock) => mock.mockReset());
    Object.values(preferences).forEach((mock) => mock.mockReset());
    Object.values(updates.tauriUpdateGateway).forEach((mock) => mock.mockReset());
    preferences.loadPreferences.mockResolvedValue({
      ...PREFERENCE_DEFAULTS,
      theme: "light",
      locale: "system",
      recentFiles: [],
      updateChecksEnabled: true,
    });
    preferences.savePreference.mockResolvedValue(undefined);
    updates.tauriUpdateGateway.check.mockResolvedValue(null);
    updates.tauriUpdateGateway.relaunch.mockResolvedValue(undefined);
    service.closeDocument.mockResolvedValue(undefined);
    service.cancelSearch.mockResolvedValue(undefined);
    service.discardEdit.mockResolvedValue(undefined);
    service.checkDocumentChange.mockResolvedValue({
      documentId: "none",
      changed: false,
      fingerprint: "same",
    });
  });

  it("opens and displays a rendered Markdown document", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\readme.md"]);
    service.openDocument.mockResolvedValue(openResult("doc-1", "readme.md"));

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));

    expect(await screen.findByRole("heading", { name: "Hello" })).toBeVisible();
    expect(screen.getByText("Safe content")).toBeVisible();
    expect(screen.getByRole("tab", { name: "readme.md" })).toHaveAttribute("aria-selected", "true");
    expect(document.title).toBe("readme.md — LitheMark");
  });

  it("opens multiple tabs and releases a closed document", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\first.md", "C:\\notes\\second.md"]);
    service.openDocument
      .mockResolvedValueOnce(openResult("doc-1", "first.md", "<h1>First</h1>"))
      .mockResolvedValueOnce(openResult("doc-2", "second.md", "<h1>Second</h1>"));

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));

    expect(await screen.findByRole("heading", { name: "Second" })).toBeVisible();
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    await fireEvent.click(screen.getByRole("button", { name: "Close second.md" }));
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(1));
    expect(service.closeDocument).toHaveBeenCalledWith("doc-2");
    expect(screen.getByRole("heading", { name: "First" })).toBeVisible();
  });

  it("shows a recoverable error when a document cannot be read", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\missing.md"]);
    service.openDocument.mockRejectedValue({
      code: "file_not_found",
      message: "The file could not be found.",
      recoverable: true,
    });

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The file could not be found.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("switches between light and dark themes", async () => {
    render(App);

    await fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(preferences.savePreference).toHaveBeenCalledWith("theme", "dark");

    await fireEvent.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("searches the active document and navigates to a result block", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\search.md"]);
    service.openDocument.mockResolvedValue(openResult("doc-search", "search.md"));
    service.searchDocument.mockResolvedValue({
      documentId: "doc-search",
      revision: 1,
      query: "content",
      matches: [
        {
          blockId: 0,
          lineNumber: 2,
          preview: "Safe content",
          previewMatchStart: 5,
          previewMatchEnd: 12,
        },
      ],
      truncated: false,
    });

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    await screen.findByRole("heading", { name: "Hello" });
    await fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    await fireEvent.input(screen.getByRole("searchbox", { name: "Search document" }), {
      target: { value: "content" },
    });

    expect(await screen.findByRole("button", { name: /Line 2.*Safe content/ })).toBeVisible();
    expect(service.searchDocument).toHaveBeenCalledWith("doc-search", "content", 1, {
      caseSensitive: false,
      wholeWord: false,
      limit: 500,
    });
  });

  it("offers an update found by the launch check", async () => {
    const install = vi.fn(async () => {});
    updates.tauriUpdateGateway.check.mockResolvedValue({
      version: "0.2.0",
      currentVersion: "0.1.0",
      install,
    });

    render(App);

    expect(await screen.findByText("LitheMark 0.2.0 is available.")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(updates.tauriUpdateGateway.relaunch).toHaveBeenCalledOnce();
  });

  it("never contacts the network when update checks are switched off", async () => {
    preferences.loadPreferences.mockResolvedValue({
      ...PREFERENCE_DEFAULTS,
      updateChecksEnabled: false,
    });

    render(App);
    // The launch check is skipped because update checks are off.
    await waitFor(() => expect(updates.tauriUpdateGateway.check).not.toHaveBeenCalled());

    // Re-enabling it from the Updates settings persists the choice without auto-checking.
    await fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    const toggle = await screen.findByRole("checkbox", {
      name: /Check for updates automatically/i,
    });
    expect(toggle).not.toBeChecked();
    await fireEvent.click(toggle);
    expect(preferences.savePreference).toHaveBeenCalledWith("updateChecksEnabled", true);
    expect(updates.tauriUpdateGateway.check).not.toHaveBeenCalled();
  });

  it("checks for updates on demand", async () => {
    preferences.loadPreferences.mockResolvedValue({
      ...PREFERENCE_DEFAULTS,
      updateChecksEnabled: false,
    });

    render(App);
    await fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));

    expect(await screen.findByRole("button", { name: "Up to date" })).toBeVisible();
    expect(updates.tauriUpdateGateway.check).toHaveBeenCalledOnce();
  });

  it("suppresses the webview menu and offers its own document menu", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\readme.md"]);
    service.openDocument.mockResolvedValue(openResult("doc-1", "readme.md"));

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    const heading = await screen.findByRole("heading", { name: "Hello" });

    const nativeMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 60,
    });
    heading.dispatchEvent(nativeMenu);

    expect(nativeMenu.defaultPrevented).toBe(true);
    expect(await screen.findByRole("menu", { name: "Context menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Find in document/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toBeDisabled();
  });

  it("closes a document from the tab context menu", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\readme.md"]);
    service.openDocument.mockResolvedValue(openResult("doc-1", "readme.md"));

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    const tab = await screen.findByRole("tab", { name: "readme.md" });

    tab.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
    await fireEvent.click(await screen.findByRole("menuitem", { name: /Close tab/ }));

    await waitFor(() => expect(service.closeDocument).toHaveBeenCalledWith("doc-1"));
    expect(screen.queryByRole("menu", { name: "Context menu" })).not.toBeInTheDocument();
  });

  it("loads the source in chunks and enters split edit mode", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\edit.md"]);
    service.openDocument.mockResolvedValue(openResult("doc-edit", "edit.md"));
    service.beginEdit.mockResolvedValue({
      documentId: "doc-edit",
      documentRevision: 1,
      draftRevision: 1,
      totalChars: 8,
      lineCount: 1,
      dirty: false,
    });
    service.getEditorChunk.mockResolvedValue({
      documentId: "doc-edit",
      draftRevision: 1,
      startChar: 0,
      nextChar: 8,
      totalChars: 8,
      text: "# Edited",
    });

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    await screen.findByRole("heading", { name: "Hello" });
    await fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByLabelText("Markdown source editor")).toBeVisible();
    expect(screen.getByRole("region", { name: "Markdown preview" })).toBeVisible();
    expect(service.beginEdit).toHaveBeenCalledWith("doc-edit", 1);
    expect(service.getEditorChunk).toHaveBeenCalledWith("doc-edit", 0, 262_144, 1);
  });
});
