<script lang="ts">
  import { onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";

  import EmptyState from "../components/common/EmptyState.svelte";
  import ErrorNotice from "../components/common/ErrorNotice.svelte";
  import DocumentChangedNotice from "../components/document/DocumentChangedNotice.svelte";
  import DocumentLoading from "../components/document/DocumentLoading.svelte";
  import DocumentView from "../components/document/DocumentView.svelte";
  import OutlinePanel from "../components/outline/OutlinePanel.svelte";
  import SearchPanel from "../components/search/SearchPanel.svelte";
  import AppShell from "../components/shell/AppShell.svelte";
  import TabBar from "../components/shell/TabBar.svelte";
  import Toolbar from "../components/shell/Toolbar.svelte";
  import { AppState } from "../features/documents/document-state.svelte";
  import { localAssetCache } from "../features/documents/asset-cache";
  import {
    closeDocument,
    cancelSearch,
    checkDocumentChange,
    openDocument,
    reloadDocument,
    searchDocument,
    selectMarkdownFiles,
  } from "../features/documents/document-service";
  import type {
    DocumentIndexReady,
    Heading,
    HeadingJump,
    RecentFile,
    Theme,
    SearchResult,
  } from "../features/documents/document-types";
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
  let jump = $state<HeadingJump | null>(null);
  let jumpNonce = 0;
  let searchOpen = $state(false);
  let searchQuery = $state("");
  let searchResult = $state<SearchResult | null>(null);
  let searchBusy = $state(false);
  let searchActiveIndex = $state(0);
  let searchCaseSensitive = $state(false);
  let searchWholeWord = $state(false);
  let searchRequest = 0;
  let changePollRunning = false;
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
        find: () => {
          if (appState.activeTab) searchOpen = true;
        },
      });
    window.addEventListener("keydown", listener);
    const changePoll = window.setInterval(() => void pollDocumentChanges(), 2_000);
    let disposed = false;
    let stopIndexListener: UnlistenFn | undefined;
    void listen<DocumentIndexReady>("document-index-ready", (event) => {
      appState.completeIndex(event.payload);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else stopIndexListener = unlisten;
    });
    void loadPreferences()
      .then((preferences) => {
        if (!themeTouched) theme = preferences.theme;
        recentFiles = preferences.recentFiles;
      })
      .catch(() => {
        // The reader remains fully usable when preferences are unavailable.
      });

    return () => {
      disposed = true;
      stopIndexListener?.();
      window.clearInterval(changePoll);
      window.removeEventListener("keydown", listener);
    };
  });

  $effect(() => {
    const tab = activeTab;
    const query = searchQuery.trim();
    const caseSensitive = searchCaseSensitive;
    const wholeWord = searchWholeWord;
    if (!searchOpen || !tab || !query || !tab.indexComplete) {
      searchResult = null;
      searchBusy = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(tab.documentId, tab.metadata.revision, query, caseSensitive, wholeWord);
    }, 180);
    return () => window.clearTimeout(timer);
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
      localAssetCache.clearDocument(documentId);
      appState.close(documentId);
      errorMessage = "";
    } catch (error) {
      showError(error);
    }
  }

  async function pollDocumentChanges() {
    if (changePollRunning || !appState.tabs.length) return;
    changePollRunning = true;
    try {
      const changes = await Promise.all(
        appState.tabs.map((tab) => checkDocumentChange(tab.documentId).catch(() => null)),
      );
      for (const change of changes) {
        if (change) appState.reportExternalChange(change);
      }
    } finally {
      changePollRunning = false;
    }
  }

  async function reloadChangedDocument(documentId: string) {
    const tab = appState.tabs.find((candidate) => candidate.documentId === documentId);
    if (!tab) return;
    tab.status = "reloading";
    try {
      const result = await reloadDocument(documentId);
      localAssetCache.clearDocument(documentId);
      appState.open(result);
      searchResult = null;
      errorMessage = "";
    } catch (error) {
      tab.status = "error";
      showError(error);
    }
  }

  async function runSearch(
    documentId: string,
    revision: number,
    query: string,
    caseSensitive: boolean,
    wholeWord: boolean,
  ) {
    const request = ++searchRequest;
    searchBusy = true;
    try {
      const result = await searchDocument(documentId, query, revision, {
        caseSensitive,
        wholeWord,
        limit: 500,
      });
      if (request !== searchRequest || activeTab?.metadata.revision !== result.revision) return;
      searchResult = result;
      searchActiveIndex = result.matches.length ? 0 : -1;
      if (result.matches.length) jumpToSearchMatch(0);
    } catch (error) {
      if (request !== searchRequest) return;
      const normalized = normalizeAppError(error);
      if (normalized.code !== "search_cancelled") showError(normalized);
    } finally {
      if (request === searchRequest) searchBusy = false;
    }
  }

  function closeSearch() {
    searchOpen = false;
    searchQuery = "";
    searchResult = null;
    searchRequest += 1;
    if (activeTab) void cancelSearch(activeTab.documentId).catch(() => {});
  }

  function moveSearch(direction: 1 | -1) {
    const matches = searchResult?.matches ?? [];
    if (!matches.length) return;
    const next = (searchActiveIndex + direction + matches.length) % matches.length;
    jumpToSearchMatch(next);
  }

  function jumpToSearchMatch(index: number) {
    const match = searchResult?.matches[index];
    if (!match || !activeTab) return;
    searchActiveIndex = index;
    jump = {
      documentId: activeTab.documentId,
      blockId: match.blockId,
      slug: `block-${match.blockId}`,
      nonce: ++jumpNonce,
    };
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

  function jumpToHeading(heading: Heading) {
    if (!activeTab) return;
    jump = {
      documentId: activeTab.documentId,
      blockId: heading.blockId,
      slug: heading.slug,
      nonce: ++jumpNonce,
    };
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
        canShowOutline={Boolean(activeTab)}
        outlineOpen={appState.sidebarOpen}
        onOpen={chooseDocuments}
        onToggleOutline={() => appState.toggleSidebar()}
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
    <div class:with-outline={appState.sidebarOpen} class="document-workspace">
      {#if appState.sidebarOpen}
        <OutlinePanel headings={activeTab.headings} onSelect={jumpToHeading} />
      {/if}
      <div class="document-stack">
        {#if activeTab.externalChange?.kind}
          <DocumentChangedNotice
            kind={activeTab.externalChange.kind}
            reloading={activeTab.status === "reloading"}
            onReload={() => void reloadChangedDocument(activeTab.documentId)}
            onDismiss={() => appState.dismissExternalChange(activeTab.documentId)}
          />
        {/if}
        {#if searchOpen}
          <SearchPanel
            query={searchQuery}
            matches={searchResult?.matches ?? []}
            activeIndex={searchActiveIndex}
            busy={searchBusy}
            indexing={!activeTab.indexComplete}
            truncated={searchResult?.truncated ?? false}
            caseSensitive={searchCaseSensitive}
            wholeWord={searchWholeWord}
            onQuery={(query) => (searchQuery = query)}
            onPrevious={() => moveSearch(-1)}
            onNext={() => moveSearch(1)}
            onSelect={jumpToSearchMatch}
            onToggleCase={() => (searchCaseSensitive = !searchCaseSensitive)}
            onToggleWholeWord={() => (searchWholeWord = !searchWholeWord)}
            onClose={closeSearch}
          />
        {/if}
        {#if errorMessage}
          <ErrorNotice compact message={errorMessage} onDismiss={() => (errorMessage = "")} />
        {/if}
        <DocumentView
          tab={activeTab}
          {jump}
          onScroll={(scrollTop) => appState.updateScroll(activeTab.documentId, scrollTop)}
          onExternalError={(message) => (errorMessage = message)}
          onInternalLink={(blockId, slug) => {
            jump = {
              documentId: activeTab.documentId,
              blockId,
              slug,
              nonce: ++jumpNonce,
            };
          }}
        />
      </div>
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
