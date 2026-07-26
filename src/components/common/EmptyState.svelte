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
  <div class="empty-state-icon" aria-hidden="true">#</div>
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
          <strong>{file.name}</strong>
          <span>{file.path}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>
