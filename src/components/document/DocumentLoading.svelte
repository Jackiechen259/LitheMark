<script lang="ts">
  import { t } from "../../features/i18n/i18n.svelte";
</script>

<section class="document-loading" aria-live="polite">
  <div class="loading-spinner" aria-hidden="true"></div>
  <strong>{t("loading.title")}</strong>
  <span>{t("loading.detail")}</span>
</section>
