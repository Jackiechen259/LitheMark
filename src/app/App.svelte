<script lang="ts">
  import { onMount } from "svelte";

  import EmptyState from "../components/common/EmptyState.svelte";
  import ErrorNotice from "../components/common/ErrorNotice.svelte";
  import DocumentLoading from "../components/document/DocumentLoading.svelte";
  import DocumentView from "../components/document/DocumentView.svelte";
  import AppShell from "../components/shell/AppShell.svelte";
  import TabBar from "../components/shell/TabBar.svelte";
  import Toolbar from "../components/shell/Toolbar.svelte";
  import { AppState } from "../features/documents/document-state.svelte";
  import {
    closeDocument,
    openDocument,
    selectMarkdownFiles,
  } from "../features/documents/document-service";
  import type { RecentFile, Theme } from "../features/documents/document-types";
  import {
    loadPreferences,
    saveRecentFiles,
    saveTheme,
  } from "../features/settings/settings-service";
  import { normalizeAppError } from "../lib/errors";
  import { handleShortcut } from "./shortcuts";

  const appState = new AppState();
  let openingCount = $state(0);
  let errorMessage = $state("");
  let attemptedPath = $state<string | null>(null);
  let recentFiles = $state<RecentFile[]>([]);
  let theme = $state<Theme>("light");
  let themeTouched = false;

  const activeTab = $derived(appState.activeTab);
  const statusText = $derived(
    activeTab
      ? `${activeTab.metadata.encoding} · ${formatBytes(activeTab.metadata.byteSize)} · ${activeTab.metadata.lineCount.toLocaleString()} lines · revision ${activeTab.metadata.revision}`
      : openingCount > 0
        ? "Opening document…"
        : "Ready",
  );

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    document.title = activeTab ? `${activeTab.metadata.name} — LitheMark` : "LitheMark";
  });

  onMount(() => {
    const listener = (event: KeyboardEvent) =>
      handleShortcut(event, {
        open: () => void chooseDocuments(),
        closeActive: () => {
          if (appState.activeDocumentId) void closeTab(appState.activeDocumentId);
        },
        nextTab: () => appState.cycle(1),
        previousTab: () => appState.cycle(-1),
      });
    window.addEventListener("keydown", listener);
    void loadPreferences()
      .then((preferences) => {
        if (!themeTouched) theme = preferences.theme;
        recentFiles = preferences.recentFiles;
      })
      .catch(() => {
        // The reader remains fully usable when preferences are unavailable.
      });

    return () => window.removeEventListener("keydown", listener);
  });

  async function chooseDocuments() {
    try {
      const paths = await selectMarkdownFiles();
      for (const path of paths) {
        await loadDocument(path);
      }
    } catch (error) {
      showError(error);
    }
  }

  async function loadDocument(path: string) {
    attemptedPath = path;
    openingCount += 1;
    errorMessage = "";

    try {
      const result = await openDocument(path);
      appState.open(result);
      updateRecentFile(result.document.displayPath, result.document.name);
    } catch (error) {
      showError(error);
    } finally {
      openingCount -= 1;
    }
  }

  async function closeTab(documentId: string) {
    try {
      await closeDocument(documentId);
      appState.close(documentId);
      errorMessage = "";
    } catch (error) {
      showError(error);
    }
  }

  function updateRecentFile(path: string, name: string) {
    recentFiles = [
      { path, name, lastOpenedMs: Date.now() },
      ...recentFiles.filter((item) => item.path.toLocaleLowerCase() !== path.toLocaleLowerCase()),
    ].slice(0, 10);
    void saveRecentFiles(recentFiles).catch(() => {
      // A failed recent-file write must not disrupt document reading.
    });
  }

  function showError(error: unknown) {
    errorMessage = normalizeAppError(error).message;
  }

  function toggleTheme() {
    themeTouched = true;
    theme = theme === "light" ? "dark" : "light";
    void saveTheme(theme).catch(() => {
      // Theme selection still applies to the current session.
    });
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<AppShell status={statusText}>
  {#snippet header()}
    <div class="header-stack">
      <Toolbar
        title={activeTab?.metadata.name ?? "LitheMark"}
        path={activeTab?.metadata.displayPath}
        {theme}
        onOpen={chooseDocuments}
        onToggleTheme={toggleTheme}
      />
      {#if appState.tabs.length}
        <TabBar
          tabs={appState.tabs}
          activeDocumentId={appState.activeDocumentId}
          onActivate={(documentId) => appState.activate(documentId)}
          onClose={(documentId) => void closeTab(documentId)}
        />
      {/if}
    </div>
  {/snippet}

  {#if openingCount > 0 && !activeTab}
    <DocumentLoading />
  {:else if activeTab}
    <div class="document-stack">
      {#if errorMessage}
        <ErrorNotice compact message={errorMessage} onDismiss={() => (errorMessage = "")} />
      {/if}
      <DocumentView
        tab={activeTab}
        onScroll={(scrollTop) => appState.updateScroll(activeTab.documentId, scrollTop)}
        onExternalError={(message) => (errorMessage = message)}
      />
    </div>
  {:else if errorMessage}
    <ErrorNotice
      message={errorMessage}
      onRetry={attemptedPath ? () => loadDocument(attemptedPath!) : undefined}
      onChoose={chooseDocuments}
    />
  {:else}
    <EmptyState
      {recentFiles}
      onOpen={chooseDocuments}
      onOpenRecent={(path) => loadDocument(path)}
    />
  {/if}
</AppShell>
