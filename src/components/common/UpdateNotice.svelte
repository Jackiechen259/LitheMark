<script lang="ts">
  import type { UpdateStatus } from "../../features/updates/update-state.svelte";

  let {
    status,
    version,
    percent,
    errorMessage,
    onInstall,
    onDismiss,
  }: {
    status: UpdateStatus;
    version?: string;
    percent: number | null;
    errorMessage: string;
    onInstall: () => void;
    onDismiss: () => void;
  } = $props();

  const busy = $derived(status === "downloading" || status === "installing");
  const message = $derived(
    status === "error"
      ? errorMessage
      : status === "installing"
        ? "Installing the update. LitheMark will restart."
        : status === "downloading"
          ? percent === null
            ? "Downloading the update…"
            : `Downloading the update… ${Math.round(percent * 100)}%`
          : `LitheMark ${version} is available.`,
  );
</script>

<div class="update-notice" class:failed={status === "error"} role="status">
  <span>{message}</span>
  {#if status === "downloading" && percent !== null}
    <progress max="1" value={percent ?? 0} aria-label="Update download progress"></progress>
  {/if}
  <div>
    {#if status === "available"}
      <button type="button" onclick={onInstall}>Install and restart</button>
    {/if}
    <button type="button" disabled={busy} onclick={onDismiss}>
      {status === "error" ? "Dismiss" : "Later"}
    </button>
  </div>
</div>
