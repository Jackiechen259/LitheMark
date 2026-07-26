import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import EmptyState from "./EmptyState.svelte";

describe("EmptyState", () => {
  it("describes the local read-only experience", () => {
    render(EmptyState);

    expect(screen.getByRole("heading", { name: "Open a Markdown document" })).toBeVisible();
    expect(screen.getByText(/keeps your files local/i)).toBeVisible();
  });

  it("accepts a custom message", () => {
    render(EmptyState, {
      props: {
        title: "Nothing open",
        description: "Choose a document to continue.",
      },
    });

    expect(screen.getByRole("heading", { name: "Nothing open" })).toBeVisible();
    expect(screen.getByText("Choose a document to continue.")).toBeVisible();
  });

  it("opens a recent file without assuming it still exists", async () => {
    const onOpenRecent = vi.fn();
    render(EmptyState, {
      props: {
        recentFiles: [
          {
            name: "notes.md",
            path: "C:\\docs\\notes.md",
            lastOpenedMs: 1,
          },
        ],
        onOpenRecent,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: /notes.md/i }));
    expect(onOpenRecent).toHaveBeenCalledWith("C:\\docs\\notes.md");
  });
});
