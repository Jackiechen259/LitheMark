<script lang="ts">
  import { onDestroy } from "svelte";

  import { openExternalUrl } from "../../features/documents/document-service";
  import type { DocumentTab } from "../../features/documents/document-types";
  import { normalizeAppError } from "../../lib/errors";
  import MarkdownBlock from "./MarkdownBlock.svelte";

  let {
    tab,
    onScroll,
    onExternalError,
  }: {
    tab: DocumentTab;
    onScroll: (scrollTop: number) => void;
    onExternalError: (message: string) => void;
  } = $props();

  let scrollFrame: number | null = null;

  async function handleContentClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (!anchor || !event.currentTarget || !(event.currentTarget instanceof Element)) return;
    if (!event.currentTarget.contains(anchor)) return;

    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();

    if (href.startsWith("#")) {
      globalThis.document.getElementById(href.slice(1))?.scrollIntoView({ block: "start" });
      return;
    }

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

  function restoreScroll(node: HTMLElement) {
    node.scrollTop = tab.scrollTop;
  }

  function handleScroll(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLElement) || scrollFrame !== null) return;

    scrollFrame = requestAnimationFrame(() => {
      onScroll(element.scrollTop);
      scrollFrame = null;
    });
  }

  onDestroy(() => {
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  });
</script>

<div class="document-scroll" use:restoreScroll onscroll={handleScroll}>
  <article class="markdown-document" aria-label={tab.metadata.name} use:interceptLinks>
    {#each tab.blocks as block (block.id)}
      <MarkdownBlock {block} />
    {/each}
  </article>
</div>
