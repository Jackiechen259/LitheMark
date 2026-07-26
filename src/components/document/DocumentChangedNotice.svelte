<script lang="ts">
  let {
    kind,
    reloading,
    onReload,
    onDismiss,
  }: {
    kind: "modified" | "deleted";
    reloading: boolean;
    onReload: () => void;
    onDismiss: () => void;
  } = $props();
</script>

<div class="document-change-notice" role="status">
  <span>
    {kind === "deleted"
      ? "This file was deleted or moved. The open snapshot is still available."
      : "This file changed on disk."}
  </span>
  <div>
    {#if kind === "modified"}
      <button type="button" disabled={reloading} onclick={onReload}>
        {reloading ? "Reloading…" : "Reload"}
      </button>
    {/if}
    <button type="button" onclick={onDismiss}>Dismiss</button>
  </div>
</div>
