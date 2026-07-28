<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  import EmptyState from "../components/common/EmptyState.svelte";
  import ErrorNotice from "../components/common/ErrorNotice.svelte";
  import UpdateNotice from "../components/common/UpdateNotice.svelte";
  import DocumentChangedNotice from "../components/document/DocumentChangedNotice.svelte";
  import DocumentLoading from "../components/document/DocumentLoading.svelte";
  import DocumentView from "../components/document/DocumentView.svelte";
  import EditorWorkspace from "../components/editor/EditorWorkspace.svelte";
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
    beginEdit,
    getEditorChunk,
    applyEditBatch,
    previewEdit,
    saveEdit,
    prepareMerge,
    applyMergeResult,
    discardEdit,
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
    TextEdit,
    DraftPreview,
    EditState,
  } from "../features/documents/document-types";
  import {
    loadPreferences,
    saveRecentFiles,
    saveTheme,
    saveUpdateChecksEnabled,
  } from "../features/settings/settings-service";
  import { tauriUpdateGateway } from "../features/updates/update-service";
  import { UpdateController } from "../features/updates/update-state.svelte";
  import { normalizeAppError } from "../lib/errors";
  import { handleShortcut } from "./shortcuts";

  const appState = new AppState();
  const updates = new UpdateController(tauriUpdateGateway);
  let updateChecksEnabled = $state(true);
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
  const editorSources = new SvelteMap<string, string>();
  let editorWorkspace = $state<EditorWorkspace | null>(null);
  let allowWindowClose = false;

  const activeTab = $derived(appState.activeTab);
  const statusText = $derived(
    activeTab
      ? `${activeTab.dirty ? "Unsaved · " : ""}${activeTab.editing ? "Editing · " : ""}${activeTab.metadata.encoding} · ${formatBytes(activeTab.metadata.byteSize)} · ${activeTab.metadata.lineCount.toLocaleString()} lines · revision ${activeTab.metadata.revision}`
      : openingCount > 0
        ? "Opening document…"
        : "Ready",
  );

  const updateNoticeVisible = $derived(
    updates.status === "available" ||
      updates.status === "downloading" ||
      updates.status === "installing" ||
      updates.status === "error",
  );
  const updateBusy = $derived(
    updates.status === "checking" ||
      updates.status === "downloading" ||
      updates.status === "installing",
  );
  const updateActionLabel = $derived(
    updates.status === "checking"
      ? "Checking…"
      : updates.status === "upToDate"
        ? "Up to date"
        : "Check for updates",
  );

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    document.title = activeTab
      ? `${activeTab.dirty ? "* " : ""}${activeTab.metadata.name} — LitheMark`
      : "LitheMark";
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
        save: () => {
          if (appState.activeTab?.editing) void saveActiveEdit();
        },
      });
    window.addEventListener("keydown", listener);
    const changePoll = window.setInterval(() => void pollDocumentChanges(), 2_000);
    let disposed = false;
    let stopIndexListener: UnlistenFn | undefined;
    let stopCloseListener: UnlistenFn | undefined;
    void listen<DocumentIndexReady>("document-index-ready", (event) => {
      appState.completeIndex(event.payload);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else stopIndexListener = unlisten;
    });
    try {
      const currentWindow = getCurrentWindow();
      void currentWindow
        .onCloseRequested(async (event) => {
          if (allowWindowClose) return;
          event.preventDefault();
          for (const tab of [...appState.tabs]) {
            if (tab.dirty && !(await confirmDirtyTab(tab, "closing LitheMark"))) return;
          }
          allowWindowClose = true;
          await currentWindow.close();
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else stopCloseListener = unlisten;
        })
        .catch(() => {
          // The browser-only test environment has no native close event.
        });
    } catch {
      // The browser-only test environment has no native window metadata.
    }
    void loadPreferences()
      .then((preferences) => {
        if (!themeTouched) theme = preferences.theme;
        recentFiles = preferences.recentFiles;
        updateChecksEnabled = preferences.updateChecksEnabled;
        // The only network request LitheMark makes, and only with consent.
        if (updateChecksEnabled) void updates.check({ silent: true });
      })
      .catch(() => {
        // The reader remains fully usable when preferences are unavailable.
      });

    return () => {
      disposed = true;
      stopIndexListener?.();
      stopCloseListener?.();
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
    const tab = appState.tabs.find((candidate) => candidate.documentId === documentId);
    if (tab?.dirty && !(await confirmDirtyTab(tab, "closing this tab"))) return;
    try {
      if (tab?.editing) await discardEdit(documentId);
      await closeDocument(documentId);
      editorSources.delete(documentId);
      localAssetCache.clearDocument(documentId);
      appState.close(documentId);
      errorMessage = "";
    } catch (error) {
      showError(error);
    }
  }

  async function confirmDirtyTab(
    tab: (typeof appState.tabs)[number],
    action: string,
  ): Promise<boolean> {
    const saveFirst = window.confirm(`Save changes to ${tab.metadata.name} before ${action}?`);
    if (saveFirst) return saveTab(tab);
    return window.confirm(`Discard unsaved changes to ${tab.metadata.name}?`);
  }

  async function toggleEditing() {
    const tab = activeTab;
    if (!tab) return;
    if (tab.editing) {
      if (tab.dirty) {
        const saveFirst = window.confirm(`Save changes to ${tab.metadata.name}?`);
        if (saveFirst) {
          if (!(await saveTab(tab))) return;
        } else if (!window.confirm("Discard the unsaved draft?")) {
          return;
        }
      }
      try {
        await discardEdit(tab.documentId);
        tab.editing = false;
        tab.dirty = false;
        tab.editStatus = undefined;
        tab.draftRevision = undefined;
        editorSources.delete(tab.documentId);
      } catch (error) {
        showError(error);
      }
      return;
    }

    tab.editing = true;
    tab.editStatus = "loading";
    errorMessage = "";
    try {
      const info = await beginEdit(tab.documentId, tab.metadata.revision);
      const chunks: string[] = [];
      let start = 0;
      while (start < info.totalChars) {
        const chunk = await getEditorChunk(tab.documentId, start, 262_144, info.draftRevision);
        chunks.push(chunk.text);
        start = chunk.nextChar;
      }
      editorSources.set(tab.documentId, chunks.join(""));
      tab.draftRevision = info.draftRevision;
      tab.dirty = info.dirty;
      tab.editStatus = "ready";
    } catch (error) {
      tab.editing = false;
      tab.editStatus = "error";
      showError(error);
    }
  }

  async function applyDocumentEdits(
    documentId: string,
    baseDraftRevision: number,
    edits: TextEdit[],
  ): Promise<EditState> {
    const tab = appState.tabs.find((candidate) => candidate.documentId === documentId);
    if (!tab) throw new Error("The edited document is no longer open");
    const state = await applyEditBatch(documentId, baseDraftRevision, edits);
    tab.draftRevision = state.draftRevision;
    tab.dirty = true;
    tab.editStatus = "ready";
    return state;
  }

  async function previewDocumentEdit(
    documentId: string,
    draftRevision: number,
    startLine?: number,
    endLine?: number,
  ): Promise<DraftPreview> {
    if (!appState.tabs.some((candidate) => candidate.documentId === documentId)) {
      throw new Error("The edited document is no longer open");
    }
    return previewEdit(documentId, draftRevision, startLine, endLine);
  }

  async function saveActiveEdit() {
    if (activeTab) await saveTab(activeTab);
  }

  async function saveTab(tab: (typeof appState.tabs)[number]): Promise<boolean> {
    if (!tab.editing || tab.draftRevision === undefined) return true;
    const activeEditor = activeTab?.documentId === tab.documentId;
    const storedSource = editorSources.get(tab.documentId) ?? "";
    if (
      activeEditor
        ? editorWorkspace?.hasConflictMarkers()
        : /^<<<<<<< |^\|\|\|\|\|\|\| |^=======\s*$|^>>>>>>> /m.test(storedSource)
    ) {
      errorMessage = "Resolve every Draft / Base / Disk conflict marker before saving.";
      return false;
    }
    tab.editStatus = "saving";
    try {
      const result = await saveEdit(tab.documentId, tab.draftRevision);
      localAssetCache.clearDocument(tab.documentId);
      const wasActive = appState.activeDocumentId === tab.documentId;
      appState.open(result.document);
      const savedTab = appState.tabs.find((candidate) => candidate.documentId === tab.documentId);
      if (savedTab) {
        savedTab.editing = true;
        savedTab.dirty = false;
        savedTab.draftRevision = result.edit.draftRevision;
        savedTab.editStatus = "ready";
      }
      if (wasActive) {
        editorWorkspace?.setDraftRevision(result.edit.draftRevision);
      }
      errorMessage = "";
      return true;
    } catch (error) {
      const normalized = normalizeAppError(error);
      if (normalized.code === "save_conflict") {
        return resolveSaveConflict(tab);
      }
      tab.editStatus = "error";
      showError(normalized);
      return false;
    }
  }

  async function resolveSaveConflict(tab: (typeof appState.tabs)[number]): Promise<boolean> {
    tab.editStatus = "conflict";
    try {
      const merge = await prepareMerge(tab.documentId, tab.draftRevision!);
      const state = await applyMergeResult(tab.documentId, merge.content, merge.diskFingerprint);
      tab.draftRevision = state.draftRevision;
      tab.dirty = true;
      editorSources.set(tab.documentId, merge.content);
      if (activeTab?.documentId === tab.documentId) {
        editorWorkspace?.replaceDocument(merge.content, state.draftRevision);
      }
      tab.editStatus = merge.hasConflicts ? "conflict" : "ready";
      errorMessage = merge.hasConflicts
        ? "The file changed on disk. Resolve the Draft / Base / Disk markers, then save again."
        : "External changes were merged. Review the result, then save again.";
      return false;
    } catch (error) {
      showError(error);
      return false;
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

  function setUpdateChecks(enabled: boolean) {
    updateChecksEnabled = enabled;
    if (!enabled) updates.dismiss();
    void saveUpdateChecksEnabled(enabled).catch(() => {
      // The choice still applies to the current session.
    });
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
        editing={Boolean(activeTab?.editing)}
        dirty={Boolean(activeTab?.dirty)}
        saving={activeTab?.editStatus === "saving"}
        onEdit={toggleEditing}
        onSave={saveActiveEdit}
      />
      {#if appState.tabs.length}
        <TabBar
          tabs={appState.tabs}
          activeDocumentId={appState.activeDocumentId}
          onActivate={(documentId) => appState.activate(documentId)}
          onClose={(documentId) => void closeTab(documentId)}
        />
      {/if}
      {#if updateNoticeVisible}
        <UpdateNotice
          status={updates.status}
          version={updates.available?.version}
          percent={updates.percent}
          errorMessage={updates.errorMessage}
          onInstall={() => void updates.install()}
          onDismiss={() => updates.dismiss()}
        />
      {/if}
    </div>
  {/snippet}

  {#snippet statusActions()}
    <label class="update-toggle">
      <input
        type="checkbox"
        checked={updateChecksEnabled}
        onchange={(event) => setUpdateChecks(event.currentTarget.checked)}
      />
      Check for updates automatically
    </label>
    <button
      type="button"
      class="status-button"
      disabled={updateBusy}
      onclick={() => void updates.check()}
    >
      {updateActionLabel}
    </button>
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
            actionLabel={activeTab.dirty ? "Merge changes" : "Reload"}
            onReload={() =>
              void (activeTab.dirty
                ? resolveSaveConflict(activeTab)
                : reloadChangedDocument(activeTab.documentId))}
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
        {#if activeTab.editing && editorSources.has(activeTab.documentId)}
          {@const editingTab = activeTab}
          <EditorWorkspace
            bind:this={editorWorkspace}
            tab={editingTab}
            source={editorSources.get(editingTab.documentId)!}
            draftRevision={editingTab.draftRevision!}
            onApplyEdits={(revision, edits) =>
              applyDocumentEdits(editingTab.documentId, revision, edits)}
            onDirty={() => {
              editingTab.dirty = true;
              editingTab.editStatus = "ready";
            }}
            onPreview={(revision, startLine, endLine) =>
              previewDocumentEdit(editingTab.documentId, revision, startLine, endLine)}
            onSave={async () => {
              await saveTab(editingTab);
            }}
            onError={showError}
            onSnapshot={(source, revision) => {
              if (
                appState.tabs.some((candidate) => candidate.documentId === editingTab.documentId)
              ) {
                editorSources.set(editingTab.documentId, source);
                editingTab.draftRevision = revision;
              }
            }}
          />
        {:else}
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
        {/if}
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
