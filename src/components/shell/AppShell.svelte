<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="app-shell">
  <header class="app-header">
    <div class="brand-mark" aria-hidden="true">L</div>
    <div>
      <strong>LitheMark</strong>
      <span>Markdown reader</span>
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>

  <footer class="app-status">Ready</footer>
</div>
