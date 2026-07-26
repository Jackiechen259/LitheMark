<script lang="ts">
  let {
    title = "Open a Markdown document",
    description = "LitheMark keeps your files local and opens them read-only.",
    onOpen,
  }: {
    title?: string;
    description?: string;
    onOpen?: () => void | Promise<void>;
  } = $props();
</script>

<section class="empty-state" aria-labelledby="empty-state-title">
  <div class="empty-state-icon" aria-hidden="true">#</div>
  <h1 id="empty-state-title">{title}</h1>
  <p>{description}</p>
  {#if onOpen}
    <button type="button" class="primary-button empty-state-action" onclick={onOpen}>
      Choose a Markdown file
    </button>
  {/if}
</section>
