<script lang="ts">
  import type { DocumentTab } from "../../features/documents/document-types";

  let {
    tabs,
    activeDocumentId,
    onActivate,
    onClose,
  }: {
    tabs: DocumentTab[];
    activeDocumentId: string | null;
    onActivate: (documentId: string) => void;
    onClose: (documentId: string) => void;
  } = $props();

  function handleAuxClick(event: MouseEvent, documentId: string) {
    if (event.button === 1) {
      event.preventDefault();
      onClose(documentId);
    }
  }
</script>

<div class="tab-bar" role="tablist" aria-label="Open documents">
  {#each tabs as tab (tab.documentId)}
    <div class:active={tab.documentId === activeDocumentId} class="tab-item">
      <button
        type="button"
        role="tab"
        aria-selected={tab.documentId === activeDocumentId}
        title={tab.metadata.displayPath}
        onclick={() => onActivate(tab.documentId)}
        onauxclick={(event) => handleAuxClick(event, tab.documentId)}
      >
        <span>{tab.metadata.name}</span>
      </button>
      <button
        type="button"
        class="tab-close"
        aria-label={`Close ${tab.metadata.name}`}
        onclick={() => onClose(tab.documentId)}
      >
        ×
      </button>
    </div>
  {/each}
</div>
