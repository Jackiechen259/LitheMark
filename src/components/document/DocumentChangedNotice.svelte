<script lang="ts">
  import { t } from "../../features/i18n/i18n.svelte";

  let {
    kind,
    reloading,
    onReload,
    onDismiss,
    actionLabel,
  }: {
    kind: "modified" | "deleted";
    reloading: boolean;
    onReload: () => void;
    onDismiss: () => void;
    actionLabel: string;
  } = $props();
</script>

<div class="document-change-notice" role="status">
  <span>
    {kind === "deleted" ? t("change.deleted") : t("change.modified")}
  </span>
  <div>
    {#if kind === "modified"}
      <button type="button" disabled={reloading} onclick={onReload}>
        {reloading ? t("change.working") : actionLabel}
      </button>
    {/if}
    <button type="button" onclick={onDismiss}>{t("change.dismiss")}</button>
  </div>
</div>
