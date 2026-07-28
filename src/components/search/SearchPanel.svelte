<script lang="ts">
  import { tick } from "svelte";

  import type { SearchMatch } from "../../features/documents/document-types";

  let {
    query,
    matches,
    activeIndex,
    busy,
    indexing,
    truncated,
    caseSensitive,
    wholeWord,
    onQuery,
    onPrevious,
    onNext,
    onSelect,
    onToggleCase,
    onToggleWholeWord,
    onClose,
  }: {
    query: string;
    matches: SearchMatch[];
    activeIndex: number;
    busy: boolean;
    indexing: boolean;
    truncated: boolean;
    caseSensitive: boolean;
    wholeWord: boolean;
    onQuery: (query: string) => void;
    onPrevious: () => void;
    onNext: () => void;
    onSelect: (index: number) => void;
    onToggleCase: () => void;
    onToggleWholeWord: () => void;
    onClose: () => void;
  } = $props();

  function focusSearch(node: HTMLInputElement) {
    void tick().then(() => {
      node.focus();
      node.select();
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="search-panel" aria-label="Find in document">
  <div class="search-controls">
    <input
      use:focusSearch
      type="search"
      aria-label="Search document"
      placeholder={indexing ? "Indexing document…" : "Find in document"}
      value={query}
      disabled={indexing}
      oninput={(event) => onQuery(event.currentTarget.value)}
    />
    <button
      type="button"
      class:active={caseSensitive}
      aria-label="Match case"
      aria-pressed={caseSensitive}
      title="Match case"
      onclick={onToggleCase}>Aa</button
    >
    <button
      type="button"
      class:active={wholeWord}
      aria-label="Match whole word"
      aria-pressed={wholeWord}
      title="Match whole word"
      onclick={onToggleWholeWord}>W</button
    >
    <span class="search-count" aria-live="polite">
      {#if indexing}
        Indexing…
      {:else if busy}
        Searching…
      {:else if query}
        {matches.length ? activeIndex + 1 : 0}/{matches.length}{truncated ? "+" : ""}
      {/if}
    </span>
    <button
      type="button"
      aria-label="Previous match"
      disabled={!matches.length}
      onclick={onPrevious}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m4 10 4-4 4 4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button type="button" aria-label="Next match" disabled={!matches.length} onclick={onNext}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m4 6 4 4 4-4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button type="button" aria-label="Close search" onclick={onClose}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m4 4 8 8m0-8-8 8" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  {#if query && matches.length}
    <ol class="search-results" aria-label="Search results">
      {#each matches.slice(0, 100) as match, index (`${match.blockId}:${match.lineNumber}:${index}`)}
        <li>
          <button
            type="button"
            class:active={index === activeIndex}
            aria-current={index === activeIndex ? "true" : undefined}
            onclick={() => onSelect(index)}
          >
            <span class="search-line">Line {match.lineNumber}</span>
            <span class="search-preview"
              >{match.preview.slice(0, match.previewMatchStart)}<mark
                >{match.preview.slice(match.previewMatchStart, match.previewMatchEnd)}</mark
              >{match.preview.slice(match.previewMatchEnd)}</span
            >
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>
