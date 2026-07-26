import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.svelte";

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
}));
const preferences = vi.hoisted(() => ({
  loadPreferences: vi.fn(),
  saveTheme: vi.fn(),
  saveRecentFiles: vi.fn(),
}));

vi.mock("../features/documents/document-service", () => service);
vi.mock("../features/settings/settings-service", () => preferences);
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
    preferences.loadPreferences.mockResolvedValue({ theme: "light", recentFiles: [] });
    preferences.saveTheme.mockResolvedValue(undefined);
    preferences.saveRecentFiles.mockResolvedValue(undefined);
    service.closeDocument.mockResolvedValue(undefined);
    service.cancelSearch.mockResolvedValue(undefined);
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
    expect(preferences.saveTheme).toHaveBeenCalledWith("dark");

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
});
