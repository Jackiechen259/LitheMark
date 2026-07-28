<script lang="ts">
  import type { Theme } from "../../features/documents/document-types";

  let {
    title,
    path,
    theme,
    canShowOutline,
    outlineOpen,
    onOpen,
    onToggleOutline,
    onToggleTheme,
    editing,
    dirty,
    saving,
    onEdit,
    onSave,
  }: {
    title: string;
    path?: string;
    theme: Theme;
    canShowOutline: boolean;
    outlineOpen: boolean;
    onOpen: () => void | Promise<void>;
    onToggleOutline: () => void;
    onToggleTheme: () => void;
    editing: boolean;
    dirty: boolean;
    saving: boolean;
    onEdit: () => void | Promise<void>;
    onSave: () => void | Promise<void>;
  } = $props();
</script>

<div class="toolbar">
  <div class="brand-mark" aria-hidden="true">L</div>
  <div class="document-identity">
    <strong>{title}</strong>
    <span title={path}>{path ?? "Fast, private Markdown reading"}</span>
  </div>
  <div class="toolbar-actions">
    {#if canShowOutline}
      {#if editing}
        <button
          type="button"
          class="primary-button"
          disabled={saving || !dirty}
          title="Save file (Ctrl+S)"
          onclick={onSave}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
            <path
              d="M3.5 2.5h7.4l2.6 2.6v8.4h-10z"
              stroke-width="1.4"
              stroke-linejoin="round"
            /><path
              d="M5.5 2.5v3h5v-3M5.5 13.5v-4h5v4"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" class="secondary-button" onclick={onEdit}>Done</button>
      {:else}
        <button type="button" class="secondary-button" title="Edit Markdown" onclick={onEdit}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
            <path
              d="m9.7 3.1 3.2 3.2-7.5 7.5-3.6.4.4-3.6zM8.3 4.5l3.2 3.2"
              stroke-width="1.4"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          Edit
        </button>
      {/if}
    {/if}
    {#if canShowOutline}
      <button
        type="button"
        class="secondary-button icon-button"
        aria-label={outlineOpen ? "Hide document outline" : "Show document outline"}
        aria-pressed={outlineOpen}
        title="Toggle outline"
        onclick={onToggleOutline}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <rect x="2" y="2.5" width="12" height="11" rx="1.6" stroke-width="1.4" />
          <path d="M6.2 2.5v11" stroke-width="1.4" />
          {#if outlineOpen}
            <path d="M3.6 5h1.2M3.6 7h1.2M3.6 9h1.2" stroke-width="1.1" stroke-linecap="round" />
          {/if}
        </svg>
      </button>
    {/if}
    <button
      type="button"
      class="secondary-button icon-button"
      aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
      title="Toggle color theme"
      onclick={onToggleTheme}
    >
      {#if theme === "light"}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M13.4 9.6a5.6 5.6 0 0 1-7-7 5.9 5.9 0 1 0 7 7z"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      {:else}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="8" cy="8" r="3.1" stroke-width="1.4" />
          <path
            d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      {/if}
    </button>
    <button type="button" class="primary-button" title="Open file (Ctrl+O)" onclick={onOpen}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          d="M1.8 4a1.2 1.2 0 0 1 1.2-1.2h3l1.4 1.6h5.6A1.2 1.2 0 0 1 14.2 5.6v6.4a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
      Open file
    </button>
  </div>
</div>
