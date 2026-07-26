<script lang="ts">
  import { localAssetCache } from "../../features/documents/asset-cache";
  import type { MarkdownBlock } from "../../features/documents/document-types";

  let { block, documentId }: { block: MarkdownBlock; documentId: string } = $props();

  function hydrateLocalImages(node: HTMLElement) {
    let disposed = false;
    for (const image of node.querySelectorAll<HTMLImageElement>("img[src]")) {
      const reference = image.getAttribute("src");
      if (!reference) continue;
      image.removeAttribute("src");
      image.classList.add("local-image-loading");
      void localAssetCache
        .load(documentId, reference)
        .then((asset) => {
          if (disposed) return;
          image.src = asset.dataUrl;
          image.classList.remove("local-image-loading");
          image.classList.add("local-image-ready");
        })
        .catch(() => {
          if (disposed) return;
          image.classList.remove("local-image-loading");
          image.classList.add("local-image-failed");
          image.title = `Unable to load local image: ${reference}`;
        });
    }

    return {
      destroy() {
        disposed = true;
      },
    };
  }
</script>

<section
  id={`block-${block.id}`}
  class="markdown-block"
  data-block-id={block.id}
  data-block-kind={block.kind}
  style={`--estimated-block-height: ${block.estimatedHeight}px`}
  use:hydrateLocalImages
>
  {#if block.html}
    {@html block.html}
  {/if}
</section>
