import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import OutlinePanel from "./OutlinePanel.svelte";

describe("OutlinePanel", () => {
  it("renders heading levels and selects distant headings by identity", async () => {
    const onSelect = vi.fn();
    const heading = {
      blockId: 420,
      level: 3,
      text: "Distant section",
      slug: "distant-section",
    };

    render(OutlinePanel, {
      props: {
        headings: [{ blockId: 0, level: 1, text: "Start", slug: "start" }, heading],
        onSelect,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Distant section" }));
    expect(onSelect).toHaveBeenCalledWith(heading);
  });

  it("shows an explicit empty state", () => {
    render(OutlinePanel, { props: { headings: [], onSelect: vi.fn() } });
    expect(screen.getByText("No headings in this document.")).toBeVisible();
  });
});
