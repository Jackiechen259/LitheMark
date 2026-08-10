<script lang="ts">
  let {
    open,
    title,
    message,
    saveLabel,
    discardLabel,
    cancelLabel,
    onSave,
    onDiscard,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    saveLabel: string;
    discardLabel: string;
    cancelLabel: string;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  } = $props();

  let cancelButton = $state<HTMLButtonElement | null>(null);
  let previousFocus: HTMLElement | null = null;

  // On open, move keyboard focus to the neutral Cancel button and hand it back to
  // whatever had it on close. Never default-focus the destructive button.
  $effect(() => {
    if (open) {
      previousFocus =
        globalThis.document.activeElement instanceof HTMLElement
          ? globalThis.document.activeElement
          : null;
      cancelButton?.focus();
    } else if (previousFocus?.isConnected) {
      previousFocus.focus();
      previousFocus = null;
    }
  });

  // Escape dismisses via Cancel and must not reach the app's window-level listener.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  // A pointer down on the backdrop itself (not the card) also activates Cancel.
  function handleBackdropPointerDown(event: PointerEvent) {
    if (event.target === event.currentTarget) onCancel();
  }
</script>

{#if open}
  <div class="dialog-backdrop" role="presentation" onpointerdown={handleBackdropPointerDown}>
    <div
      class="dialog-card"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
      aria-describedby="unsaved-dialog-message"
      tabindex="-1"
      onkeydown={handleKeydown}
    >
      <h2 id="unsaved-dialog-title" class="dialog-title">{title}</h2>
      <p id="unsaved-dialog-message" class="dialog-message">{message}</p>
      <div class="dialog-actions">
        <button type="button" class="secondary-button" bind:this={cancelButton} onclick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" class="primary-button danger-button" onclick={onDiscard}>
          {discardLabel}
        </button>
        <button type="button" class="primary-button" onclick={onSave}>
          {saveLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
