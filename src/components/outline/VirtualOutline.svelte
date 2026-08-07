<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";

  import type { Heading } from "../../features/documents/document-types";
  import { t } from "../../features/i18n/i18n.svelte";

  let {
    headings,
    onSelect,
  }: {
    headings: Heading[];
    onSelect: (heading: Heading) => void;
  } = $props();

  let scrollElement = $state<HTMLElement | null>(null);
  // Keep in step with --outline-row-pitch in app.css so both outline paths share a rhythm.
  const rowPitch = 34;
  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowPitch,
    overscan: 10,
  });

  $effect(() => {
    $virtualizer.setOptions({
      count: headings.length,
      getScrollElement: () => scrollElement,
      estimateSize: () => rowPitch,
      overscan: 10,
    });
  });
</script>

<div class="virtual-outline" bind:this={scrollElement}>
  <nav
    aria-label={t("outline.ariaHeadings")}
    class="virtual-outline-list"
    style={`--outline-total-height: ${$virtualizer.getTotalSize()}px`}
  >
    {#each $virtualizer.getVirtualItems() as item (item.key)}
      {@const heading = headings[item.index]}
      <button
        type="button"
        title={heading.text}
        data-index={item.index}
        data-level={heading.level}
        style={`--outline-depth: ${heading.level - 1}; transform: translateY(${item.start}px)`}
        onclick={() => onSelect(heading)}
      >
        {heading.text}
      </button>
    {/each}
  </nav>
</div>
