<script lang="ts">
  import { t } from "../../features/i18n/i18n.svelte";
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
        ? t("updates.installing")
        : status === "downloading"
          ? percent === null
            ? t("updates.downloading")
            : t("updates.downloadingPercent", { percent: Math.round(percent * 100) })
          : t("updates.available", { version: version ?? "" }),
  );
</script>

<div class="update-notice" class:failed={status === "error"} role="status">
  <span>{message}</span>
  {#if status === "downloading" && percent !== null}
    <progress max="1" value={percent ?? 0} aria-label={t("updates.downloadProgress")}></progress>
  {/if}
  <div>
    {#if status === "available"}
      <button type="button" onclick={onInstall}>{t("updates.install")}</button>
    {/if}
    <button type="button" disabled={busy} onclick={onDismiss}>
      {status === "error" ? t("updates.dismiss") : t("updates.later")}
    </button>
  </div>
</div>
