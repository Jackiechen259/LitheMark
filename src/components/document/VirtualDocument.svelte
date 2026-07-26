<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { onDestroy } from "svelte";

  import { BlockCache } from "../../features/documents/block-cache";
  import { getBlocks, openExternalUrl } from "../../features/documents/document-service";
  import type { DocumentTab, HeadingJump } from "../../features/documents/document-types";
  import { normalizeAppError } from "../../lib/errors";
  import MarkdownBlock from "./MarkdownBlock.svelte";

  let {
    tab,
    jump,
    onScroll,
    onExternalError,
    onInternalLink,
  }: {
    tab: DocumentTab;
    jump: HeadingJump | null;
    onScroll: (scrollTop: number) => void;
    onExternalError: (message: string) => void;
    onInternalLink: (blockId: number, slug: string) => void;
  } = $props();

  let scrollElement = $state<HTMLElement | null>(null);
  let cache = $state.raw(new BlockCache());
  let cacheVersion = $state(0);
  let sessionKey = "";
  let scrollFrame: number | null = null;
  let activeRequest = "";

  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => cache.peek(index)?.estimatedHeight ?? 120,
    overscan: 12,
    initialOffset: () => tab.scrollTop,
    getItemKey: (index) => index,
  });

  $effect(() => {
    const nextKey = `${tab.documentId}:${tab.metadata.revision}`;
    if (nextKey !== sessionKey) {
      sessionKey = nextKey;
      cache = new BlockCache(tab.metadata.mode === "huge" ? 360 : 600);
      cache.seed(tab.blocks);
      cacheVersion += 1;
      activeRequest = "";
    }
    const count = tab.metadata.blockCount ?? tab.blocks.length;
    $virtualizer.setOptions({
      count,
      getScrollElement: () => scrollElement,
      estimateSize: (index) => cache.peek(index)?.estimatedHeight ?? 120,
      overscan: 12,
      getItemKey: (index) => index,
    });
  });

  $effect(() => {
    cacheVersion;
    const items = $virtualizer.getVirtualItems();
    const missing = items.find((item) => !cache.peek(item.index));
    if (missing && tab.indexComplete) {
      void fetchAround(missing.index);
    }
  });

  $effect(() => {
    if (!jump || jump.documentId !== tab.documentId) return;
    jump.nonce;
    $virtualizer.scrollToIndex(jump.blockId, { align: "start" });
  });

  async function fetchAround(index: number) {
    const total = tab.metadata.blockCount ?? 0;
    if (total === 0) return;
    const start = Math.max(0, Math.min(total - 1, index) - 32);
    const count = Math.min(96, total - start);
    const requestKey = `${tab.documentId}:${tab.metadata.revision}:${start}:${count}`;
    if (activeRequest === requestKey) return;
    activeRequest = requestKey;
    const requestedDocument = tab.documentId;
    const requestedRevision = tab.metadata.revision;

    try {
      const batch = await getBlocks(requestedDocument, start, count, requestedRevision);
      if (
        tab.documentId !== requestedDocument ||
        tab.metadata.revision !== requestedRevision ||
        batch.documentId !== requestedDocument ||
        batch.revision !== requestedRevision
      ) {
        return;
      }
      cache.seed(batch.blocks);
      cacheVersion += 1;
      $virtualizer.measure();
    } catch (error) {
      const normalized = normalizeAppError(error);
      if (normalized.code !== "stale_revision") onExternalError(normalized.message);
    } finally {
      if (activeRequest === requestKey) activeRequest = "";
    }
  }

  function measureBlock(node: HTMLElement) {
    node.dataset.index ??= node.dataset.blockId ?? "";
    $virtualizer.measureElement(node);
    return {
      update() {
        $virtualizer.measureElement(node);
      },
    };
  }

  async function handleContentClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor || !(event.currentTarget instanceof Element)) return;
    if (!event.currentTarget.contains(anchor)) return;

    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    if (href.startsWith("#")) {
      const slug = href.slice(1);
      const heading = tab.headings.find((candidate) => candidate.slug === slug);
      if (heading) onInternalLink(heading.blockId, heading.slug);
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

<div
  class="document-scroll"
  class:indexing={!tab.indexComplete}
  id={`panel-${tab.documentId}`}
  role="tabpanel"
  aria-labelledby={`tab-${tab.documentId}`}
  tabindex="0"
  bind:this={scrollElement}
  onscroll={handleScroll}
>
  <article
    class="markdown-document virtual-document"
    aria-label={tab.metadata.name}
    use:interceptLinks
    style={`--virtual-height: ${$virtualizer.getTotalSize()}px`}
  >
    {#each $virtualizer.getVirtualItems() as item (item.key)}
      {@const block = cache.peek(item.index)}
      <div
        class="virtual-row"
        data-index={item.index}
        style={`transform: translateY(${item.start}px)`}
      >
        {#if block}
          <div use:measureBlock data-index={item.index} data-block-id={block.id}>
            <MarkdownBlock {block} documentId={tab.documentId} />
          </div>
        {:else}
          <div class="block-placeholder" style={`height: ${item.size}px`} aria-hidden="true"></div>
        {/if}
      </div>
    {/each}
  </article>
</div>
