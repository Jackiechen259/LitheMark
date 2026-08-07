import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import HomeView from "./HomeView.svelte";

describe("HomeView", () => {
  it("describes the local read-only experience", () => {
    render(HomeView, { props: { onOpen: vi.fn() } });

    expect(screen.getByRole("heading", { name: "LitheMark" })).toBeVisible();
    expect(screen.getByText(/keeps your files local/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose Markdown files" })).toBeVisible();
  });

  it("opens a recent file without assuming it still exists", async () => {
    const onOpenRecent = vi.fn();
    render(HomeView, {
      props: {
        recentFiles: [
          {
            name: "notes.md",
            path: "C:\\docs\\notes.md",
            lastOpenedMs: Date.now() - 60_000,
          },
        ],
        onOpenRecent,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: /notes\.md/i }));
    expect(onOpenRecent).toHaveBeenCalledWith("C:\\docs\\notes.md");
  });

  it("shows a placeholder when there are no recent files", () => {
    render(HomeView, { props: { recentFiles: [] } });

    expect(screen.getByText(/No recent files yet/i)).toBeVisible();
  });

  it("removes a recent file from the list", async () => {
    const onRemoveRecent = vi.fn();
    render(HomeView, {
      props: {
        recentFiles: [{ name: "gone.md", path: "C:\\docs\\gone.md", lastOpenedMs: 1 }],
        onRemoveRecent,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: /Remove from recent/i }));
    expect(onRemoveRecent).toHaveBeenCalledWith("C:\\docs\\gone.md");
  });
});
