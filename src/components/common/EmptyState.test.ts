import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

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
});
