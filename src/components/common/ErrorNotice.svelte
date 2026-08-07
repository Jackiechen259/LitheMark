<script lang="ts">
  import { t } from "../../features/i18n/i18n.svelte";

  let {
    message,
    compact = false,
    onRetry,
    onChoose,
    onDismiss,
  }: {
    message: string;
    compact?: boolean;
    onRetry?: () => void | Promise<void>;
    onChoose?: () => void | Promise<void>;
    onDismiss?: () => void;
  } = $props();
</script>

<section class:compact class="error-notice" role="alert">
  <div>
    <strong>{compact ? t("error.openLink") : t("error.openDocument")}</strong>
    <p>{message}</p>
  </div>
  <div class="error-actions">
    {#if onRetry}
      <button type="button" class="secondary-button" onclick={onRetry}>{t("error.retry")}</button>
    {/if}
    {#if onChoose}
      <button type="button" class="primary-button" onclick={onChoose}>
        {t("error.chooseAnother")}
      </button>
    {/if}
    {#if onDismiss}
      <button type="button" class="secondary-button" onclick={onDismiss}>
        {t("error.dismiss")}
      </button>
    {/if}
  </div>
</section>
