<script lang="ts">
  let {
    title = "Open a Markdown document",
    description = "LitheMark keeps your files local and opens them read-only.",
  }: {
    title?: string;
    description?: string;
  } = $props();
</script>

<section class="empty-state" aria-labelledby="empty-state-title">
  <div class="empty-state-icon" aria-hidden="true">#</div>
  <h1 id="empty-state-title">{title}</h1>
  <p>{description}</p>
</section>
