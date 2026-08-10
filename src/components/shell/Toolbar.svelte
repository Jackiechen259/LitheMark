<script lang="ts">
  import AppIcon from "../common/AppIcon.svelte";
  import type { Theme } from "../../features/documents/document-types";
  import { t } from "../../features/i18n/i18n.svelte";

  let {
    title,
    path,
    theme,
    canShowOutline,
    outlineOpen,
    inSettings,
    onOpen,
    onOpenSettings,
    onCloseSettings,
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
    inSettings: boolean;
    onOpen: () => void | Promise<void>;
    onOpenSettings: () => void;
    onCloseSettings: () => void;
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
  <div class="brand-mark" aria-hidden="true">
    <AppIcon size={32} />
  </div>
  <div class="document-identity">
    <strong>{inSettings ? t("settings.title") : title}</strong>
    {#if !inSettings}
      <span title={path}>{path ?? t("toolbar.identityFallback")}</span>
    {/if}
  </div>
  <div class="toolbar-actions">
    {#if inSettings}
      <button type="button" class="primary-button" onclick={onCloseSettings}>
        {t("toolbar.done")}
      </button>
    {:else}
      {#if canShowOutline}
        {#if editing}
          <button
            type="button"
            class="primary-button"
            disabled={saving || !dirty}
            title={t("toolbar.saveHint")}
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
            {saving ? t("toolbar.saving") : t("toolbar.save")}
          </button>
          <button type="button" class="secondary-button" onclick={onEdit}
            >{t("toolbar.done")}</button
          >
        {:else}
          <button
            type="button"
            class="secondary-button"
            title={t("toolbar.editMarkdown")}
            onclick={onEdit}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
              <path
                d="m9.7 3.1 3.2 3.2-7.5 7.5-3.6.4.4-3.6zM8.3 4.5l3.2 3.2"
                stroke-width="1.4"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </svg>
            {t("toolbar.edit")}
          </button>
        {/if}
      {/if}
      {#if canShowOutline}
        <button
          type="button"
          class="secondary-button icon-button"
          aria-label={outlineOpen ? t("toolbar.hideOutline") : t("toolbar.showOutline")}
          aria-pressed={outlineOpen}
          title={t("toolbar.toggleOutline")}
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
        aria-label={theme === "light" ? t("toolbar.useDarkTheme") : t("toolbar.useLightTheme")}
        title={t("toolbar.toggleTheme")}
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
      <button
        type="button"
        class="secondary-button icon-button"
        aria-label={t("toolbar.settings")}
        title={t("toolbar.settingsHint")}
        onclick={onOpenSettings}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="8" cy="8" r="2.1" stroke-width="1.4" />
          <path
            d="M8 1.3v1.6M8 13.1v1.6M1.3 8h1.6M13.1 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M3.3 12.7l1.1-1.1M11.6 4.4l1.1-1.1"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <button type="button" class="primary-button" title={t("toolbar.openHint")} onclick={onOpen}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M1.8 4a1.2 1.2 0 0 1 1.2-1.2h3l1.4 1.6h5.6A1.2 1.2 0 0 1 14.2 5.6v6.4a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
        {t("toolbar.open")}
      </button>
    {/if}
  </div>
</div>
