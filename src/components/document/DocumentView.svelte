<script lang="ts">
  import { openExternalUrl } from "../../features/documents/document-service";
  import type { RenderedDocument } from "../../features/documents/document-types";
  import { normalizeAppError } from "../../lib/errors";

  let {
    document: markdownDocument,
    onExternalError,
  }: {
    document: RenderedDocument;
    onExternalError: (message: string) => void;
  } = $props();

  async function handleContentClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (!anchor || !event.currentTarget || !(event.currentTarget instanceof Element)) return;
    if (!event.currentTarget.contains(anchor)) return;

    event.preventDefault();
    const href = anchor.getAttribute("href");
    if (!href) return;

    try {
      await openExternalUrl(href);
    } catch (error) {
      onExternalError(normalizeAppError(error).message);
    }
  }

  function interceptLinks(node: HTMLElement) {
    node.addEventListener("click", handleContentClick);
    return {
      destroy() {
        node.removeEventListener("click", handleContentClick);
      },
    };
  }
</script>

<div class="document-scroll">
  <article class="markdown-document" aria-label={markdownDocument.name} use:interceptLinks>
    {@html markdownDocument.html}
  </article>
</div>
