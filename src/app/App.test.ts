import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.svelte";
import { PREFERENCE_DEFAULTS } from "../features/settings/settings-service";

// jsdom does not implement Range geometry. CodeMirror's drawSelection layer re-measures the
// view when a save changes the draft revision, calling range.getClientRects(); an empty rect
// list is a graceful no-op there, so this keeps the test output free of stray errors.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  const emptyRects = [] as unknown as DOMRectList;
  Range.prototype.getClientRects = () => emptyRects;
  Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  });
}

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
// Captures the native close handler so tests can drive a real `onCloseRequested` event.
const nativeWindow = vi.hoisted(() => ({
  close: vi.fn(),
  closeHandler: undefined as ((event: { preventDefault: () => void }) => Promise<void>) | undefined,
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
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (handler) => {
      nativeWindow.closeHandler = handler;
      return vi.fn();
    }),
    close: nativeWindow.close,
  }),
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

/** The resolved shape `saveTab` expects from `saveEdit` for a successful save. */
function saveResult(id: string, name: string) {
  return {
    // `SaveEditResult.document` is a full `OpenDocumentResult` (saveTab passes it straight
    // to `appState.open`), not a bare `DocumentMetadata`.
    document: openResult(id, name),
    edit: { draftRevision: 2 },
  };
}

/** Open a single file and enter edit mode so its tab becomes dirty (no CodeMirror needed). */
async function openAndEditSingleDirtyTab() {
  service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\a.md"]);
  service.openDocument.mockResolvedValue(openResult("doc-a", "a.md", "<h1>A</h1>"));
  service.beginEdit.mockResolvedValue({
    documentId: "doc-a",
    documentRevision: 1,
    draftRevision: 1,
    totalChars: 8,
    lineCount: 1,
    dirty: true,
  });
  service.getEditorChunk.mockResolvedValue({
    documentId: "doc-a",
    draftRevision: 1,
    startChar: 0,
    nextChar: 8,
    totalChars: 8,
    text: "# A",
  });

  render(App);
  await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
  await screen.findByRole("heading", { name: "A" });
  await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByLabelText("Markdown source editor");
}

/** Open two files and enter edit mode on both so both tabs become dirty. */
async function openAndEditTwoDirtyTabs() {
  service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\a.md", "C:\\notes\\b.md"]);
  service.openDocument
    .mockResolvedValueOnce(openResult("doc-a", "a.md", "<h1>A</h1>"))
    .mockResolvedValueOnce(openResult("doc-b", "b.md", "<h1>B</h1>"));
  service.beginEdit.mockImplementation(async (documentId: string) => ({
    documentId,
    documentRevision: 1,
    draftRevision: 1,
    totalChars: 8,
    lineCount: 1,
    dirty: true,
  }));
  service.getEditorChunk.mockImplementation(async (documentId: string) => ({
    documentId,
    draftRevision: 1,
    startChar: 0,
    nextChar: 8,
    totalChars: 8,
    text: "# A",
  }));

  render(App);
  await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
  await screen.findByRole("heading", { name: "B" });
  await fireEvent.click(screen.getByRole("tab", { name: "a.md" }));
  await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByLabelText("Markdown source editor");
  await fireEvent.click(screen.getByRole("tab", { name: "b.md" }));
  await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByLabelText("Markdown source editor");
}

/** Drive the captured native close handler; returns the preventDefault spy for assertions. */
function requestAppClose() {
  const preventDefault = vi.fn();
  nativeWindow.closeHandler?.({ preventDefault });
  return preventDefault;
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
    service.saveEdit.mockImplementation(async (documentId: string) =>
      saveResult(documentId, "saved.md"),
    );
    service.checkDocumentChange.mockResolvedValue({
      documentId: "none",
      changed: false,
      fingerprint: "same",
    });
    nativeWindow.close.mockReset();
    nativeWindow.closeHandler = undefined;
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

  it("closes a dirty tab after Save, persisting the draft first", async () => {
    await openAndEditSingleDirtyTab();
    service.saveEdit.mockResolvedValue(saveResult("doc-a", "a.md"));

    await fireEvent.click(screen.getByRole("button", { name: "Close a.md" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Save changes to a.md before closing this tab?");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(service.saveEdit).toHaveBeenCalledWith("doc-a", 1);
      expect(service.discardEdit).toHaveBeenCalledWith("doc-a");
      expect(service.closeDocument).toHaveBeenCalledWith("doc-a");
    });
    await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
  });

  it("closes a dirty tab with Don't Save, skipping the save", async () => {
    await openAndEditSingleDirtyTab();

    await fireEvent.click(screen.getByRole("button", { name: "Close a.md" }));
    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Don't Save" }));

    await waitFor(() => {
      expect(service.saveEdit).not.toHaveBeenCalled();
      expect(service.discardEdit).toHaveBeenCalledWith("doc-a");
      expect(service.closeDocument).toHaveBeenCalledWith("doc-a");
    });
    await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
  });

  it("keeps a dirty tab open when the tab close dialog is cancelled", async () => {
    await openAndEditSingleDirtyTab();

    await fireEvent.click(screen.getByRole("button", { name: "Close a.md" }));
    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(service.saveEdit).not.toHaveBeenCalled();
    expect(service.discardEdit).not.toHaveBeenCalled();
    expect(service.closeDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "a.md" })).toBeVisible();
    expect(screen.getByLabelText("Markdown source editor")).toBeVisible();
  });

  it("exits the app without saving when Exit Without Saving is chosen", async () => {
    await openAndEditSingleDirtyTab();

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Save changes to a.md before closing LitheMark?");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Exit Without Saving" }));

    await waitFor(() => expect(nativeWindow.close).toHaveBeenCalledOnce());
    expect(service.saveEdit).not.toHaveBeenCalled();
  });

  it("keeps the app open when the app close dialog is cancelled", async () => {
    await openAndEditSingleDirtyTab();

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(nativeWindow.close).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "a.md" })).toBeVisible();
  });

  it("saves the draft and exits when Save and Exit is chosen", async () => {
    await openAndEditSingleDirtyTab();
    service.saveEdit.mockResolvedValue(saveResult("doc-a", "a.md"));

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Save and Exit" }));

    await waitFor(() => {
      expect(service.saveEdit).toHaveBeenCalledWith("doc-a", 1);
      expect(nativeWindow.close).toHaveBeenCalledOnce();
    });
  });

  it("saves all dirty tabs in order and exits when Save All and Exit is chosen", async () => {
    await openAndEditTwoDirtyTabs();

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(dialog).toHaveTextContent(
      "2 documents have unsaved changes. Save them before closing LitheMark?",
    );
    await fireEvent.click(within(dialog).getByRole("button", { name: "Save All and Exit" }));

    await waitFor(() => expect(nativeWindow.close).toHaveBeenCalledOnce());
    expect(service.saveEdit).toHaveBeenNthCalledWith(1, "doc-a", 1);
    expect(service.saveEdit).toHaveBeenNthCalledWith(2, "doc-b", 1);
  });

  it("exits without saving any of several dirty tabs", async () => {
    await openAndEditTwoDirtyTabs();

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Exit Without Saving" }));

    await waitFor(() => expect(nativeWindow.close).toHaveBeenCalledOnce());
    expect(service.saveEdit).not.toHaveBeenCalled();
  });

  it("aborts the app close and keeps the window open when a save fails mid-way", async () => {
    await openAndEditTwoDirtyTabs();
    service.saveEdit.mockResolvedValueOnce(saveResult("doc-a", "a.md")).mockRejectedValueOnce({
      code: "io",
      message: "A file system operation failed.",
      recoverable: false,
    });

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Save All and Exit" }));

    await waitFor(() => expect(service.saveEdit).toHaveBeenNthCalledWith(2, "doc-b", 1));
    expect(await screen.findByRole("alert")).toHaveTextContent("A file system operation failed.");
    expect(nativeWindow.close).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("shows a close error and lets a later close attempt succeed", async () => {
    await openAndEditSingleDirtyTab();
    nativeWindow.close.mockRejectedValue(new Error("Close refused"));

    const preventDefault = requestAppClose();
    expect(preventDefault).toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Exit Without Saving" }));

    await waitFor(() => expect(nativeWindow.close).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).toHaveTextContent("Close refused");

    // The failed attempt must not leave the window permanently unclosable.
    nativeWindow.close.mockResolvedValue(undefined);
    const preventDefaultRetry = requestAppClose();
    expect(preventDefaultRetry).toHaveBeenCalled();

    const dialogAgain = await screen.findByRole("alertdialog");
    await fireEvent.click(within(dialogAgain).getByRole("button", { name: "Exit Without Saving" }));

    await waitFor(() => expect(nativeWindow.close).toHaveBeenCalledTimes(2));
    expect(service.saveEdit).not.toHaveBeenCalled();
  });

  it("closes the app immediately, without a prompt, when no tab is dirty", async () => {
    service.selectMarkdownFiles.mockResolvedValue(["C:\\notes\\clean.md"]);
    service.openDocument.mockResolvedValue(openResult("doc-clean", "clean.md"));

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    await screen.findByRole("heading", { name: "Hello" });

    const preventDefault = requestAppClose();

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(nativeWindow.close).toHaveBeenCalledOnce());
  });
});
