import { describe, expect, it } from "vitest";

import { AppState } from "./document-state.svelte";
import type { OpenDocumentResult } from "./document-types";

function result(id: string, name: string): OpenDocumentResult {
  return {
    document: {
      id,
      name,
      displayPath: `C:\\docs\\${name}`,
      byteSize: 10,
      modifiedAtMs: 0,
      encoding: "UTF-8",
      lineCount: 1,
      mode: "full",
      revision: 1,
    },
    html: `<p>${name}</p>`,
    reused: false,
  };
}

describe("AppState", () => {
  it("deduplicates tabs and activates the existing document", () => {
    const state = new AppState();
    state.open(result("one", "one.md"));
    state.open(result("two", "two.md"));
    state.open({ ...result("one", "one.md"), reused: true });

    expect(state.tabs).toHaveLength(2);
    expect(state.activeDocumentId).toBe("one");
  });

  it("selects a neighboring tab after closing the active tab", () => {
    const state = new AppState();
    state.open(result("one", "one.md"));
    state.open(result("two", "two.md"));
    state.open(result("three", "three.md"));

    state.close("two");
    expect(state.activeDocumentId).toBe("three");

    state.close("three");
    expect(state.activeDocumentId).toBe("one");
  });

  it("cycles tabs and preserves per-tab scroll state", () => {
    const state = new AppState();
    state.open(result("one", "one.md"));
    state.open(result("two", "two.md"));
    state.updateScroll("two", 420);
    state.cycle(1);

    expect(state.activeDocumentId).toBe("one");
    expect(state.tabs.find((tab) => tab.documentId === "two")?.scrollTop).toBe(420);
  });
});
