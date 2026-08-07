<script lang="ts">
  import type { Heading } from "../../features/documents/document-types";
  import { t } from "../../features/i18n/i18n.svelte";
  import VirtualOutline from "./VirtualOutline.svelte";

  let {
    headings,
    onSelect,
  }: {
    headings: Heading[];
    onSelect: (heading: Heading) => void;
  } = $props();
</script>

<aside class="outline-panel" aria-label={t("outline.aria")}>
  <div class="outline-heading">{t("outline.heading")}</div>
  {#if headings.length}
    {#if headings.length > 250}
      <VirtualOutline {headings} {onSelect} />
    {:else}
      <nav aria-label={t("outline.ariaHeadings")}>
        {#each headings as heading (heading.blockId)}
          <button
            type="button"
            title={heading.text}
            data-level={heading.level}
            style={`--outline-depth: ${heading.level - 1}`}
            onclick={() => onSelect(heading)}
          >
            {heading.text}
          </button>
        {/each}
      </nav>
    {/if}
  {:else}
    <p>{t("outline.empty")}</p>
  {/if}
</aside>
