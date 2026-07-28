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

  function handleTabKey(event: KeyboardEvent, index: number) {
    let targetIndex: number | null = null;
    if (event.key === "ArrowRight") targetIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") targetIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") targetIndex = 0;
    else if (event.key === "End") targetIndex = tabs.length - 1;
    else if (event.key === "Delete") {
      event.preventDefault();
      onClose(tabs[index].documentId);
      return;
    }
    if (targetIndex === null) return;

    event.preventDefault();
    const target = tabs[targetIndex];
    onActivate(target.documentId);
    globalThis.document.getElementById(`tab-${target.documentId}`)?.focus();
  }
</script>

<div class="tab-bar" role="tablist" aria-label="Open documents">
  {#each tabs as tab (tab.documentId)}
    <div
      class:active={tab.documentId === activeDocumentId}
      class="tab-item"
      data-tab-id={tab.documentId}
    >
      <button
        type="button"
        id={`tab-${tab.documentId}`}
        role="tab"
        aria-selected={tab.documentId === activeDocumentId}
        aria-controls={`panel-${tab.documentId}`}
        tabindex={tab.documentId === activeDocumentId ? 0 : -1}
        title={tab.metadata.displayPath}
        onclick={() => onActivate(tab.documentId)}
        onkeydown={(event) => handleTabKey(event, tabs.indexOf(tab))}
        onauxclick={(event) => handleAuxClick(event, tab.documentId)}
      >
        {#if tab.dirty}
          <span class="tab-dirty-dot" aria-hidden="true"></span>
        {/if}
        <span class="tab-label">{tab.metadata.name}</span>
      </button>
      <button
        type="button"
        class="tab-close"
        aria-label={`Close ${tab.metadata.name}`}
        onclick={() => onClose(tab.documentId)}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="m4 4 8 8m0-8-8 8" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {/each}
</div>
