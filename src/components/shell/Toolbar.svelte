<script lang="ts">
  import type { Theme } from "../../features/documents/document-types";

  let {
    title,
    path,
    theme,
    onOpen,
    onToggleTheme,
  }: {
    title: string;
    path?: string;
    theme: Theme;
    onOpen: () => void | Promise<void>;
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
    <button type="button" class="secondary-button" onclick={onToggleTheme}>
      {theme === "light" ? "Dark" : "Light"}
    </button>
    <button type="button" class="primary-button" onclick={onOpen}>Open file</button>
  </div>
</div>
