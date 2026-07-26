<script lang="ts">
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
    <strong>{compact ? "Could not open link" : "Could not open document"}</strong>
    <p>{message}</p>
  </div>
  <div class="error-actions">
    {#if onRetry}
      <button type="button" class="secondary-button" onclick={onRetry}>Retry</button>
    {/if}
    {#if onChoose}
      <button type="button" class="primary-button" onclick={onChoose}>Choose another</button>
    {/if}
    {#if onDismiss}
      <button type="button" class="secondary-button" onclick={onDismiss}>Dismiss</button>
    {/if}
  </div>
</section>
