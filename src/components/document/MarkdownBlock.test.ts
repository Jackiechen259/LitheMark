import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import MarkdownBlock from "./MarkdownBlock.svelte";

const assets = vi.hoisted(() => ({
  load: vi.fn(),
}));

vi.mock("../../features/documents/asset-cache", () => ({
  localAssetCache: assets,
}));

describe("MarkdownBlock", () => {
  it("hydrates safe local image references through the bounded asset service", async () => {
    assets.load.mockResolvedValue({
      dataUrl: "data:image/png;base64,aW1hZ2U=",
      mimeType: "image/png",
      byteSize: 5,
    });
    const { container } = render(MarkdownBlock, {
      props: {
        documentId: "doc-1",
        block: {
          id: 0,
          kind: "paragraph",
          sourceStart: 0,
          sourceEnd: 20,
          estimatedHeight: 80,
          html: '<p><img src="images/diagram.png" alt="Diagram"></p>',
        },
      },
    });

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    await waitFor(() => expect(image).toHaveAttribute("src", "data:image/png;base64,aW1hZ2U="));
    expect(assets.load).toHaveBeenCalledWith("doc-1", "images/diagram.png");
  });
});
