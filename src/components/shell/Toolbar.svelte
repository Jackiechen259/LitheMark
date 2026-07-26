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
  }: {
    title: string;
    path?: string;
    theme: Theme;
    canShowOutline: boolean;
    outlineOpen: boolean;
    onOpen: () => void | Promise<void>;
    onToggleOutline: () => void;
    onToggleTheme: () => void;
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
      <button
        type="button"
        class="secondary-button"
        aria-label={outlineOpen ? "Hide document outline" : "Show document outline"}
        aria-pressed={outlineOpen}
        title="Toggle outline"
        onclick={onToggleOutline}
      >
        {outlineOpen ? "Hide outline" : "Show outline"}
      </button>
    {/if}
    <button
      type="button"
      class="secondary-button"
      aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
      title="Toggle color theme"
      onclick={onToggleTheme}
    >
      {theme === "light" ? "Dark" : "Light"}
    </button>
    <button type="button" class="primary-button" title="Open file (Ctrl+O)" onclick={onOpen}
      >Open file</button
    >
  </div>
</div>
