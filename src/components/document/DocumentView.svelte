<script lang="ts">
  import { onDestroy, tick } from "svelte";

  import { openExternalUrl } from "../../features/documents/document-service";
  import type { DocumentTab, HeadingJump } from "../../features/documents/document-types";
  import { normalizeAppError } from "../../lib/errors";
  import MarkdownBlock from "./MarkdownBlock.svelte";
  import VirtualDocument from "./VirtualDocument.svelte";

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

  $effect(() => {
    if (!jump || jump.documentId !== tab.documentId || tab.metadata.mode !== "full") return;
    jump.nonce;
    void tick().then(() => {
      globalThis.document.getElementById(jump.slug)?.scrollIntoView?.({
        block: "start",
        behavior: "smooth",
      });
    });
  });
</script>

{#if tab.metadata.mode === "full"}
  <div
    class="document-scroll"
    id={`panel-${tab.documentId}`}
    role="tabpanel"
    aria-labelledby={`tab-${tab.documentId}`}
    tabindex="0"
    use:restoreScroll
    onscroll={handleScroll}
  >
    <article class="markdown-document" aria-label={tab.metadata.name} use:interceptLinks>
      {#each tab.blocks as block (block.id)}
        <MarkdownBlock {block} documentId={tab.documentId} />
      {/each}
    </article>
  </div>
{:else}
  <VirtualDocument {tab} {jump} {onScroll} {onExternalError} {onInternalLink} />
{/if}
