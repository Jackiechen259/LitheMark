<script lang="ts">
  import type { RecentFile } from "../../features/documents/document-types";
  import { activeLocale, t } from "../../features/i18n/i18n.svelte";
  import { formatRelativeTime } from "../../lib/format";

  let {
    recentFiles = [],
    onOpen,
    onOpenRecent,
    onRemoveRecent,
    onClearRecent,
    onOpenSettings,
  }: {
    recentFiles?: RecentFile[];
    onOpen?: () => void | Promise<void>;
    onOpenRecent?: (path: string) => void | Promise<void>;
    onRemoveRecent?: (path: string) => void;
    onClearRecent?: () => void;
    onOpenSettings?: () => void;
  } = $props();

  let shortcutsOpen = $state(false);

  const locale = $derived(activeLocale());

  const shortcuts = $derived([
    { label: t("home.shortcuts.open"), keys: "Ctrl+O" },
    { label: t("home.shortcuts.close"), keys: "Ctrl+W" },
    { label: t("home.shortcuts.find"), keys: "Ctrl+F" },
    { label: t("home.shortcuts.save"), keys: "Ctrl+S" },
    { label: t("home.shortcuts.nextTab"), keys: "Ctrl+Tab" },
  ]);
</script>

<section class="home-view" aria-labelledby="home-title">
  <div class="home-grid">
    <div class="home-brand">
      <div class="home-brand-mark" aria-hidden="true">L</div>
      <h1 id="home-title">{t("app.name")}</h1>
      <p class="home-tagline">{t("home.description")}</p>
      {#if onOpen}
        <button type="button" class="primary-button home-primary" onclick={onOpen}>
          {t("home.chooseFiles")}
        </button>
        <span class="home-hint">{t("home.openHint")}</span>
      {/if}

      <div class="home-secondary">
        {#if onOpenSettings}
          <button type="button" onclick={onOpenSettings}>{t("toolbar.settings")}</button>
        {/if}
        <button
          type="button"
          aria-expanded={shortcutsOpen}
          onclick={() => (shortcutsOpen = !shortcutsOpen)}
        >
          {t("home.shortcuts")}
        </button>
      </div>
      {#if shortcutsOpen}
        <div class="home-shortcuts">
          {#each shortcuts as shortcut (shortcut.label)}
            <div class="home-shortcut">
              <span>{shortcut.label}</span>
              <kbd>{shortcut.keys}</kbd>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="home-recent">
      <div class="home-recent-header">
        <h2>{t("home.recent.title")}</h2>
        {#if recentFiles.length && onClearRecent}
          <button type="button" class="home-link-button" onclick={onClearRecent}>
            {t("home.recent.clear")}
          </button>
        {/if}
      </div>
      {#if recentFiles.length}
        <ul class="home-recent-list">
          {#each recentFiles as file (file.path)}
            <li class="home-recent-item">
              <button
                type="button"
                class="home-recent-open"
                title={file.path}
                onclick={() => onOpenRecent?.(file.path)}
              >
                <span class="home-recent-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <path
                      d="M3.5 2.8A1.3 1.3 0 0 1 4.8 1.5h4.7l3 3v9.7a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3z"
                      stroke-width="1.3"
                      stroke-linejoin="round"
                    />
                    <path d="M9.5 1.5v3h3" stroke-width="1.3" stroke-linejoin="round" />
                  </svg>
                </span>
                <span class="home-recent-text">
                  <strong>{file.name}</strong>
                  <span class="home-recent-time"
                    >{formatRelativeTime(file.lastOpenedMs, locale)}</span
                  >
                  <span class="home-recent-path">{file.path}</span>
                </span>
              </button>
              {#if onRemoveRecent}
                <button
                  type="button"
                  class="home-recent-remove"
                  aria-label={t("home.recent.remove")}
                  title={t("home.recent.remove")}
                  onclick={() => onRemoveRecent(file.path)}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="m4 4 8 8m0-8-8 8" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="home-recent-empty">{t("home.recent.empty")}</p>
      {/if}
    </div>
  </div>
</section>
