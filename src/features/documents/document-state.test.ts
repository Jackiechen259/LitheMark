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
      blockCount: 1,
      revision: 1,
    },
    initialBlocks: [
      {
        id: 0,
        kind: "paragraph",
        sourceStart: 0,
        sourceEnd: name.length,
        estimatedHeight: 40,
        html: `<p>${name}</p>`,
      },
    ],
    headings: [],
    indexComplete: true,
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

  it("accepts only index completion events for the current revision", () => {
    const state = new AppState();
    state.open(result("one", "one.md"));
    state.completeIndex({
      document: { ...result("one", "one.md").document, revision: 2, blockCount: 20 },
      headings: [],
    });
    expect(state.tabs[0].metadata.revision).toBe(1);

    state.completeIndex({
      document: { ...result("one", "one.md").document, blockCount: 20 },
      headings: [{ blockId: 5, level: 2, text: "Later", slug: "later" }],
    });
    expect(state.tabs[0].metadata.blockCount).toBe(20);
    expect(state.tabs[0].headings[0].slug).toBe("later");
  });

  it("applies an index event that races ahead of the open response", () => {
    const state = new AppState();
    const opened = result("one", "one.md");
    state.completeIndex({
      document: { ...opened.document, blockCount: 2_000, mode: "virtualized" },
      headings: [{ blockId: 900, level: 2, text: "Indexed", slug: "indexed" }],
    });
    state.open({ ...opened, indexComplete: false });

    expect(state.tabs[0].indexComplete).toBe(true);
    expect(state.tabs[0].metadata.blockCount).toBe(2_000);
    expect(state.tabs[0].headings[0].blockId).toBe(900);
  });

  it("reports, dismisses, and resets external file changes by fingerprint", () => {
    const state = new AppState();
    state.open(result("one", "one.md"));
    state.reportExternalChange({
      documentId: "one",
      changed: true,
      kind: "modified",
      fingerprint: "10:2",
    });
    expect(state.tabs[0].externalChange?.kind).toBe("modified");

    state.dismissExternalChange("one");
    state.reportExternalChange({
      documentId: "one",
      changed: true,
      kind: "modified",
      fingerprint: "10:2",
    });
    expect(state.tabs[0].externalChange).toBeUndefined();

    state.reportExternalChange({
      documentId: "one",
      changed: true,
      kind: "deleted",
      fingerprint: "deleted",
    });
    expect(state.tabs[0].externalChange?.kind).toBe("deleted");

    state.reportExternalChange({
      documentId: "one",
      changed: false,
      fingerprint: "10:2",
    });
    expect(state.tabs[0].externalChange).toBeUndefined();
    expect(state.tabs[0].ignoredChangeFingerprint).toBeUndefined();
  });

  it("preserves scroll position while applying a reload result", () => {
    const state = new AppState();
    state.open(result("one", "one.md"));
    state.updateScroll("one", 640);
    const reloaded = result("one", "one.md");
    reloaded.document.revision = 2;
    state.open(reloaded);

    expect(state.tabs[0].metadata.revision).toBe(2);
    expect(state.tabs[0].scrollTop).toBe(640);
    expect(state.tabs[0].status).toBe("ready");
  });
});
