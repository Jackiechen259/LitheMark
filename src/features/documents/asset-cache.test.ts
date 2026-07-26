import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalAssetCache } from "./asset-cache";

const service = vi.hoisted(() => ({
  loadLocalAsset: vi.fn(),
}));

vi.mock("./document-service", () => service);

describe("LocalAssetCache", () => {
  beforeEach(() => {
    service.loadLocalAsset.mockReset();
    service.loadLocalAsset.mockImplementation(async (_documentId: string, reference: string) => ({
      dataUrl: `data:image/png;base64,${reference}`,
      mimeType: "image/png",
      byteSize: 6,
    }));
  });

  it("deduplicates requests and bounds retained asset bytes", async () => {
    const cache = new LocalAssetCache(12, 10);
    await Promise.all([cache.load("doc", "one.png"), cache.load("doc", "one.png")]);
    await cache.load("doc", "two.png");
    await cache.load("doc", "three.png");

    expect(service.loadLocalAsset).toHaveBeenCalledTimes(3);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(12);
  });

  it("releases cached assets when a document closes", async () => {
    const cache = new LocalAssetCache();
    await cache.load("one", "image.png");
    await cache.load("two", "image.png");
    cache.clearDocument("one");

    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(6);
  });
});
