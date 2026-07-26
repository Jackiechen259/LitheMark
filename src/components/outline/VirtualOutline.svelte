<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";

  import type { Heading } from "../../features/documents/document-types";

  let {
    headings,
    onSelect,
  }: {
    headings: Heading[];
    onSelect: (heading: Heading) => void;
  } = $props();

  let scrollElement = $state<HTMLElement | null>(null);
  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => 34,
    overscan: 10,
  });

  $effect(() => {
    $virtualizer.setOptions({
      count: headings.length,
      getScrollElement: () => scrollElement,
      estimateSize: () => 34,
      overscan: 10,
    });
  });
</script>

<div class="virtual-outline" bind:this={scrollElement}>
  <nav
    aria-label="Headings"
    class="virtual-outline-list"
    style={`--outline-total-height: ${$virtualizer.getTotalSize()}px`}
  >
    {#each $virtualizer.getVirtualItems() as item (item.key)}
      {@const heading = headings[item.index]}
      <button
        type="button"
        title={heading.text}
        data-index={item.index}
        style={`--outline-depth: ${heading.level - 1}; transform: translateY(${item.start}px)`}
        onclick={() => onSelect(heading)}
      >
        {heading.text}
      </button>
    {/each}
  </nav>
</div>
