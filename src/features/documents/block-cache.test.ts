import { describe, expect, it } from "vitest";

import { BlockCache } from "./block-cache";
import type { MarkdownBlock } from "./document-types";

function block(id: number): MarkdownBlock {
  return {
    id,
    kind: "paragraph",
    sourceStart: id,
    sourceEnd: id + 1,
    estimatedHeight: 40,
    html: `<p>${id}</p>`,
  };
}

describe("BlockCache", () => {
  it("evicts the least recently used rendered block", () => {
    const cache = new BlockCache(2);
    cache.seed([block(0), block(1)]);
    cache.get(0);
    cache.set(block(2));

    expect(cache.peek(0)).toBeDefined();
    expect(cache.peek(1)).toBeUndefined();
    expect(cache.peek(2)).toBeDefined();
  });

  it("never grows beyond its configured capacity", () => {
    const cache = new BlockCache(3);
    cache.seed(Array.from({ length: 20 }, (_, index) => block(index)));

    expect(cache.size).toBe(3);
  });
});
