<script lang="ts">
  import type { Heading } from "../../features/documents/document-types";
  import VirtualOutline from "./VirtualOutline.svelte";

  let {
    headings,
    onSelect,
  }: {
    headings: Heading[];
    onSelect: (heading: Heading) => void;
  } = $props();
</script>

<aside class="outline-panel" aria-label="Document outline">
  <div class="outline-heading">Outline</div>
  {#if headings.length}
    {#if headings.length > 250}
      <VirtualOutline {headings} {onSelect} />
    {:else}
      <nav aria-label="Headings">
        {#each headings as heading (heading.blockId)}
          <button
            type="button"
            title={heading.text}
            style={`--outline-depth: ${heading.level - 1}`}
            onclick={() => onSelect(heading)}
          >
            {heading.text}
          </button>
        {/each}
      </nav>
    {/if}
  {:else}
    <p>No headings in this document.</p>
  {/if}
</aside>
