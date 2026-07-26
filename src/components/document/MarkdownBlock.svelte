<script lang="ts">
  import type { MarkdownBlock } from "../../features/documents/document-types";

  let { block }: { block: MarkdownBlock } = $props();
</script>

<section
  id={`block-${block.id}`}
  class="markdown-block"
  data-block-id={block.id}
  data-block-kind={block.kind}
  style={`--estimated-block-height: ${block.estimatedHeight}px`}
>
  {#if block.html}
    {@html block.html}
  {/if}
</section>
