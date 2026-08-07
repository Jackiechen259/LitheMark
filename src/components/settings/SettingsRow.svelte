<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    description,
    children,
  }: {
    label: string;
    description?: string;
    children: Snippet;
  } = $props();
</script>

<div class="settings-row">
  <div class="settings-row-text">
    <strong>{label}</strong>
    {#if description}<p>{description}</p>{/if}
  </div>
  <div class="settings-row-control">{@render children()}</div>
</div>
