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
  <header class="app-header">
    {@render header()}
  </header>

  <main class="app-main">
    {@render children()}
  </main>

  <footer class="app-status">{status}</footer>
</div>
