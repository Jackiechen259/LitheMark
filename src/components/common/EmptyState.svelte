<script lang="ts">
  import type { RecentFile } from "../../features/documents/document-types";

  let {
    title = "Open a Markdown document",
    description = "LitheMark keeps your files local and opens them read-only.",
    recentFiles = [],
    onOpen,
    onOpenRecent,
  }: {
    title?: string;
    description?: string;
    recentFiles?: RecentFile[];
    onOpen?: () => void | Promise<void>;
    onOpenRecent?: (path: string) => void | Promise<void>;
  } = $props();
</script>

<section class="empty-state" aria-labelledby="empty-state-title">
  <div class="empty-state-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M5 3.5h9l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 20.5v-15A1.5 1.5 0 0 1 5.5 3.5z"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path d="M14 3.5v5h5" stroke-width="1.7" stroke-linejoin="round" />
      <path
        d="M8 13.8v-3.3l1.9 2 1.9-2v3.3M14.6 12.4h2.6M14.6 15h2.6"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
  <h1 id="empty-state-title">{title}</h1>
  <p>{description}</p>
  {#if onOpen}
    <button type="button" class="primary-button empty-state-action" onclick={onOpen}>
      Choose Markdown files
    </button>
  {/if}

  {#if recentFiles.length && onOpenRecent}
    <div class="recent-files">
      <h2>Recent files</h2>
      {#each recentFiles as file (file.path)}
        <button type="button" title={file.path} onclick={() => onOpenRecent?.(file.path)}>
          <span class="recent-file-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path
                d="M3.5 2.8A1.3 1.3 0 0 1 4.8 1.5h4.7l3 3v9.7a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3z"
                stroke-width="1.3"
                stroke-linejoin="round"
              />
              <path d="M9.5 1.5v3h3" stroke-width="1.3" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="recent-file-text">
            <strong>{file.name}</strong>
            <span>{file.path}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}
</section>
