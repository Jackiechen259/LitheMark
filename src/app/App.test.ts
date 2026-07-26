import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.svelte";

const service = vi.hoisted(() => ({
  selectMarkdownFile: vi.fn(),
  openDocument: vi.fn(),
  openExternalUrl: vi.fn(),
}));

vi.mock("../features/documents/document-service", () => service);

describe("App", () => {
  beforeEach(() => {
    service.selectMarkdownFile.mockReset();
    service.openDocument.mockReset();
    service.openExternalUrl.mockReset();
  });

  it("opens and displays a rendered Markdown document", async () => {
    service.selectMarkdownFile.mockResolvedValue("C:\\notes\\readme.md");
    service.openDocument.mockResolvedValue({
      name: "readme.md",
      displayPath: "C:\\notes\\readme.md",
      byteSize: 128,
      modifiedAtMs: 0,
      encoding: "UTF-8",
      lineCount: 2,
      html: "<h1>Hello</h1><p>Safe content</p>",
    });

    render(App);
    await fireEvent.click(screen.getByRole("button", { name: "Open file" }));

    expect(await screen.findByRole("heading", { name: "Hello" })).toBeVisible();
    expect(screen.getByText("Safe content")).toBeVisible();
    expect(document.title).toBe("readme.md — LitheMark");
  });

  it("shows a recoverable error when a document cannot be read", async () => {
    service.selectMarkdownFile.mockResolvedValue("C:\\notes\\missing.md");
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

    await fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    await fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
