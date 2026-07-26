<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    header,
    children,
    status,
  }: {
    header: Snippet;
    children: Snippet;
    status: string;
  } = $props();
</script>

<div class="app-shell">
  <a class="skip-link" href="#app-main">Skip to document</a>
  <header class="app-header">
    {@render header()}
  </header>

  <main class="app-main" id="app-main" tabindex="-1">
    {@render children()}
  </main>

  <footer class="app-status" role="status" aria-live="polite">{status}</footer>
</div>
