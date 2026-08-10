<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";
  import { t } from "../../features/i18n/i18n.svelte";

  // Browser / test hosts have no Tauri native window. Resolve it lazily so the chrome
  // still renders there, and guard every native interaction so a missing window (or a
  // rejected command) never breaks the rest of the app.
  let appWindow: TauriWindow | undefined;
  try {
    appWindow = getCurrentWindow();
  } catch {
    appWindow = undefined;
  }

  let maximized = $state(false);

  onMount(() => {
    let unlistenResized: (() => void) | undefined;
    const win = appWindow;
    if (win) {
      void refreshMaximized();
      void win
        .onResized(() => refreshMaximized())
        .then((unlisten) => {
          unlistenResized = unlisten;
        })
        .catch(() => {
          // Browser/test host: no resize events to observe.
        });
    }
    return () => {
      unlistenResized?.();
    };
  });

  async function refreshMaximized(): Promise<void> {
    const win = appWindow;
    if (!win) return;
    try {
      maximized = await win.isMaximized();
    } catch {
      // Browser/test host: ignore.
    }
  }

  function onDragZoneMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || !appWindow) return;

    if (event.detail === 2) {
      void toggleMaximize();
    } else {
      void startDragging();
    }
  }

  async function startDragging(): Promise<void> {
    const win = appWindow;
    if (!win) return;
    try {
      await win.startDragging();
    } catch {
      // Browser/test host: ignore.
    }
  }

  async function toggleMaximize(): Promise<void> {
    const win = appWindow;
    if (!win) return;
    try {
      await win.toggleMaximize();
      await refreshMaximized();
    } catch {
      // Browser/test host: ignore.
    }
  }

  async function minimize(): Promise<void> {
    const win = appWindow;
    if (!win) return;
    try {
      await win.minimize();
    } catch {
      // Browser/test host: ignore.
    }
  }

  // `close()` (never `destroy()`) so the existing unsaved-changes guard in App.svelte,
  // wired through `onCloseRequested`, still runs before the window closes.
  async function closeWindow(): Promise<void> {
    const win = appWindow;
    if (!win) return;
    try {
      await win.close();
    } catch {
      // Browser/test host: ignore.
    }
  }
</script>

<div class="title-bar">
  <div class="title-bar-brand">
    <span class="title-bar-title">{t("app.name")}</span>
  </div>
  <div class="title-bar-drag-zone" aria-hidden="true" onmousedown={onDragZoneMouseDown}></div>
  <div class="title-bar-controls">
    <button
      type="button"
      class="title-bar-button"
      aria-label={t("titlebar.minimize")}
      title={t("titlebar.minimize")}
      onclick={minimize}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M3 11.6h10" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </button>
    <button
      type="button"
      class="title-bar-button"
      aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
      title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
      onclick={toggleMaximize}
    >
      {#if maximized}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5.6 5.6V3.6h6.8v6.8h-2" stroke-width="1.4" stroke-linejoin="round" />
          <rect x="3.6" y="5.6" width="6.8" height="6.8" rx="1" stroke-width="1.4" />
        </svg>
      {:else}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1" stroke-width="1.4" />
        </svg>
      {/if}
    </button>
    <button
      type="button"
      class="title-bar-button close"
      aria-label={t("titlebar.close")}
      title={t("titlebar.close")}
      onclick={closeWindow}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m4 4 8 8M12 4l-8 8" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</div>
