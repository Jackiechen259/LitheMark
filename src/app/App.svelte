<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { getVersion } from "@tauri-apps/api/app";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  import ContextMenu from "../components/common/ContextMenu.svelte";
  import ErrorNotice from "../components/common/ErrorNotice.svelte";
  import UnsavedChangesDialog from "../components/common/UnsavedChangesDialog.svelte";
  import UpdateNotice from "../components/common/UpdateNotice.svelte";
  import DocumentChangedNotice from "../components/document/DocumentChangedNotice.svelte";
  import DocumentLoading from "../components/document/DocumentLoading.svelte";
  import DocumentView from "../components/document/DocumentView.svelte";
  import EditorWorkspace from "../components/editor/EditorWorkspace.svelte";
  import HomeView from "../components/home/HomeView.svelte";
  import OutlinePanel from "../components/outline/OutlinePanel.svelte";
  import SearchPanel from "../components/search/SearchPanel.svelte";
  import AppShell from "../components/shell/AppShell.svelte";
  import SettingsView from "../components/settings/SettingsView.svelte";
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
    openExternalUrl,
    reloadDocument,
    searchDocument,
    selectMarkdownFiles,
  } from "../features/documents/document-service";
  import type {
    AppPreferences,
    DocumentIndexReady,
    Heading,
    HeadingJump,
    RecentFile,
    Theme,
    ThemePreference,
    SearchResult,
    TextEdit,
    DraftPreview,
    EditState,
  } from "../features/documents/document-types";
  import {
    loadPreferences,
    savePreference,
    PREFERENCE_DEFAULTS,
  } from "../features/settings/settings-service";
  import { activeLocale, setLocale, t } from "../features/i18n/i18n.svelte";
  import { tauriUpdateGateway } from "../features/updates/update-service";
  import { UpdateController } from "../features/updates/update-state.svelte";
  import { readClipboardText, writeClipboardText } from "../lib/clipboard";
  import { localizeAppError, normalizeAppError } from "../lib/errors";
  import { formatBytes } from "../lib/format";
  import {
    buildContextMenu,
    classifyContextTarget,
    type ContextMenuActions,
    type ContextMenuEntry,
    type FieldElement,
  } from "./context-menu";
  import { handleShortcut } from "./shortcuts";
  import type { UnsavedDecision } from "./unsaved-changes";

  const appState = new AppState();
  const updates = new UpdateController(tauriUpdateGateway);
  let preferences = $state<AppPreferences>({ ...PREFERENCE_DEFAULTS });
  let openingCount = $state(0);
  let errorMessage = $state("");
  let attemptedPath = $state<string | null>(null);
  let theme = $state<Theme>("light");
  let themePreference = $state<ThemePreference>("system");
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
  let sidebarTouched = false;
  let appVersion = $state("-");
  let settingsFocus = $state<string | undefined>(undefined);
  const editorSources = new SvelteMap<string, string>();
  let editorWorkspace = $state<EditorWorkspace | null>(null);
  let allowWindowClose = false;
  let contextMenu = $state<{ x: number; y: number; entries: ContextMenuEntry[] } | null>(null);

  type UnsavedPrompt = {
    scope: "tab" | "app";
    names: string[];
  };

  let unsavedPrompt = $state<UnsavedPrompt | null>(null);
  let resolveUnsavedPrompt: ((decision: UnsavedDecision) => void) | null = null;
  // Guards against duplicate close prompts: system close events can fire twice, and
  // keyboard shortcuts like Ctrl+W must not stack a second prompt. Tasks 4/5 set/reset it
  // around their close flows. Distinct from `allowWindowClose`, which lets the final
  // `currentWindow.close()` pass through `onCloseRequested`.
  let closeDecisionInFlight = false;

  const activeTab = $derived(appState.activeTab);
  const statusText = $derived(
    activeTab
      ? `${activeTab.dirty ? `${t("status.unsaved")} · ` : ""}${activeTab.editing ? `${t("status.editing")} · ` : ""}${activeTab.metadata.encoding} · ${formatBytes(activeTab.metadata.byteSize)} · ${activeTab.metadata.lineCount.toLocaleString(activeLocale())} ${t("status.lines")} · ${t("status.revision")} ${activeTab.metadata.revision}`
      : openingCount > 0
        ? t("app.openingDocument")
        : t("app.ready"),
  );

  const updateNoticeVisible = $derived(
    updates.status === "available" ||
      updates.status === "downloading" ||
      updates.status === "installing" ||
      updates.status === "error",
  );

  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.lang = activeLocale();
    root.style.setProperty("--content-font-size", `${preferences.contentFontSize}rem`);
    root.style.setProperty("--content-width", `${preferences.contentWidth}rem`);
    root.style.setProperty(
      "--content-font",
      preferences.contentFont === "sans" ? "var(--font-ui)" : "var(--font-content)",
    );
    // The indexing pill is a CSS ::after, so its label rides in as a quoted string variable.
    root.style.setProperty("--indexing-label", `"${t("document.indexing")}"`);
    document.title = activeTab
      ? `${activeTab.dirty ? "* " : ""}${activeTab.metadata.name} — ${t("app.name")}`
      : t("app.name");
  });

  // Keep the open tab paths persisted so a relaunch can restore them when enabled.
  $effect(() => {
    const paths = appState.tabs.map((tab) => tab.metadata.displayPath);
    void savePreference("lastOpenPaths", paths).catch(() => {
      // A failed write does not disrupt the session.
    });
  });

  onMount(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && appState.view === "settings") {
        appState.closeSettings();
        return;
      }
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
        openSettings: () => {
          settingsFocus = undefined;
          appState.openSettings();
        },
      });
    };
    window.addEventListener("keydown", listener);
    // LitheMark always draws its own menu, so the webview's never gets to appear.
    const contextMenuListener = (event: MouseEvent) => {
      event.preventDefault();
      showContextMenu(event);
    };
    window.addEventListener("contextmenu", contextMenuListener);
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
          if (closeDecisionInFlight) return;
          closeDecisionInFlight = true;
          try {
            const dirtyTabs = appState.tabs.filter((tab) => tab.dirty);

            if (dirtyTabs.length > 0) {
              const decision = await requestUnsavedDecision({
                scope: "app",
                names: dirtyTabs.map((tab) => tab.metadata.name),
              });

              if (decision === "cancel") return;

              if (decision === "save") {
                // Serial, never Promise.all: a save may hit a conflict or merge, and the user
                // must see which document failed. On the first failure, do NOT close.
                for (const tab of dirtyTabs) {
                  const saved = await saveTab(tab);
                  if (!saved) return;
                }
              }
              // decision === "discard": intentionally do not write any draft to disk
            }

            allowWindowClose = true;
            try {
              await currentWindow.close();
            } catch (error) {
              // A refused close must not leave the window permanently unclosable.
              allowWindowClose = false;
              showError(error);
            }
          } finally {
            if (!allowWindowClose) closeDecisionInFlight = false;
          }
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
    void getVersion()
      .then((value) => (appVersion = value))
      .catch(() => {
        // The browser test host has no Tauri app metadata.
      });
    void loadPreferences()
      .then((loaded) => {
        preferences = loaded;
        if (!themeTouched) {
          themePreference = loaded.theme;
          theme = resolveTheme(loaded.theme);
        }
        if (!sidebarTouched) {
          appState.sidebarOpen = loaded.outlineOpenByDefault;
        }
        setLocale(loaded.locale);
        // The only network request LitheMark makes, and only with consent.
        if (loaded.updateChecksEnabled) void updates.check({ silent: true });
        if (loaded.restoreTabsOnLaunch) void restoreTabs(loaded.lastOpenPaths);
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
      window.removeEventListener("contextmenu", contextMenuListener);
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

  /** Reopen the tabs that were present when LitheMark last closed, skipping any that vanished. */
  async function restoreTabs(paths: string[]) {
    for (const path of paths) {
      try {
        const result = await openDocument(path);
        appState.open(result);
      } catch {
        // The file may have been deleted or moved; restore carries on silently.
      }
    }
  }

  async function closeTab(documentId: string) {
    const tab = appState.tabs.find((candidate) => candidate.documentId === documentId);
    if (!tab) return;

    if (tab.dirty) {
      if (closeDecisionInFlight) return; // no second prompt while deciding
      closeDecisionInFlight = true;
      try {
        const decision = await requestUnsavedDecision({
          scope: "tab",
          names: [tab.metadata.name],
        });
        if (decision === "cancel") return; // tab and draft stay untouched
        if (decision === "save") {
          const saved = await saveTab(tab);
          if (!saved) return; // save failed/conflict: keep the tab open
        }
        // decision === "discard": fall through — do NOT call saveTab/saveEdit here
      } finally {
        closeDecisionInFlight = false;
      }
    }

    try {
      if (tab.editing) await discardEdit(documentId);
      await closeDocument(documentId);
      editorSources.delete(documentId);
      localAssetCache.clearDocument(documentId);
      appState.close(documentId);
      errorMessage = "";
    } catch (error) {
      showError(error);
    }
  }

  /** Open the unsaved-changes dialog and resolve with the user's choice. */
  function requestUnsavedDecision(prompt: UnsavedPrompt): Promise<UnsavedDecision> {
    return new Promise((resolve) => {
      unsavedPrompt = prompt;
      resolveUnsavedPrompt = resolve;
    });
  }

  function finishUnsavedDecision(decision: UnsavedDecision) {
    const resolve = resolveUnsavedPrompt;
    unsavedPrompt = null;
    resolveUnsavedPrompt = null;
    resolve?.(decision);
  }

  async function toggleEditing() {
    const tab = activeTab;
    if (!tab) return;
    if (tab.editing) {
      if (tab.dirty) {
        const saveFirst = window.confirm(t("confirm.saveChanges", { name: tab.metadata.name }));
        if (saveFirst) {
          if (!(await saveTab(tab))) return;
        } else if (!window.confirm(t("confirm.discardDraft"))) {
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
    if (!tab) throw new Error(t("editor.noLongerOpen"));
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
      throw new Error(t("editor.noLongerOpen"));
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
      errorMessage = t("editor.conflictMarkers");
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
      errorMessage = merge.hasConflicts ? t("editor.fileChangedMerge") : t("editor.externalMerged");
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
    preferences.recentFiles = [
      { path, name, lastOpenedMs: Date.now() },
      ...preferences.recentFiles.filter(
        (item) => item.path.toLocaleLowerCase() !== path.toLocaleLowerCase(),
      ),
    ].slice(0, 10);
    void savePreference("recentFiles", preferences.recentFiles).catch(() => {
      // A failed recent-file write must not disrupt document reading.
    });
  }

  function showError(error: unknown) {
    errorMessage = localizeAppError(normalizeAppError(error));
  }

  function toggleTheme() {
    themeTouched = true;
    const next: Theme = theme === "light" ? "dark" : "light";
    handlePreferenceChange("theme", next);
  }

  /**
   * Apply a preference from the settings view or an in-shell control: update the reactive
   * preference object, run any side effect the change implies, and persist it. Side effects
   * live in `applyPreferenceSideEffect` so this stays a single write path.
   */
  function handlePreferenceChange<K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K],
  ) {
    preferences[key] = value;
    applyPreferenceSideEffect(key);
    void savePreference(key, value).catch(() => {
      // The change still applies to the current session.
    });
  }

  function applyPreferenceSideEffect(key: keyof AppPreferences) {
    switch (key) {
      case "theme":
        themeTouched = true;
        themePreference = preferences.theme;
        theme = resolveTheme(preferences.theme);
        break;
      case "locale":
        setLocale(preferences.locale);
        break;
      case "updateChecksEnabled":
        if (!preferences.updateChecksEnabled) updates.dismiss();
        break;
      // contentFontSize, contentWidth and contentFont are applied by the root $effect that
      // reads `preferences`, so no imperative side effect is needed here.
    }
  }

  function resolveTheme(preference: ThemePreference): Theme {
    if (preference !== "system") return preference;
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
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

  function showContextMenu(event: MouseEvent) {
    // Right-clicking the open menu keeps it, rather than stacking a second one.
    if (event.target instanceof Element && event.target.closest(".context-menu")) return;

    const selectionText = globalThis.getSelection?.()?.toString() ?? "";
    const target = classifyContextTarget(event.target, selectionText);
    const entries = buildContextMenu(target, contextMenuActions(), t);
    if (!entries.length) return;
    contextMenu = { ...contextMenuAnchor(event), entries };
  }

  function contextMenuAnchor(event: MouseEvent) {
    // The Menu key and Shift+F10 report no pointer position; anchor to the element.
    if (event.clientX > 0 || event.clientY > 0) return { x: event.clientX, y: event.clientY };
    if (!(event.target instanceof Element)) return { x: 0, y: 0 };
    const rect = event.target.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
  }

  function contextMenuActions(): ContextMenuActions {
    return {
      hasDocument: Boolean(activeTab),
      editing: Boolean(activeTab?.editing),
      dirty: Boolean(activeTab?.dirty),
      saving: activeTab?.editStatus === "saving",
      tabCount: appState.tabs.length,
      outlineOpen: appState.sidebarOpen,
      editor: activeTab?.editing ? editorWorkspace : null,
      openFile: () => void chooseDocuments(),
      closeTab: (documentId) => void closeTab(documentId),
      closeOtherTabs: (documentId) => void closeTabsExcept(documentId),
      closeAllTabs: () => void closeTabsExcept(null),
      copyTabPath: (documentId) => {
        const tab = appState.tabs.find((candidate) => candidate.documentId === documentId);
        if (tab) copyToClipboard(tab.metadata.displayPath);
      },
      openLink: (href) => void followLink(href),
      copyText: copyToClipboard,
      selectAllRegion,
      fieldCut: (field) => void cutField(field),
      fieldCopy: (field) => copyToClipboard(fieldSelection(field)),
      fieldPaste: (field) => void pasteIntoField(field),
      fieldSelectAll: (field) => {
        field.focus();
        field.select();
      },
      find: () => {
        if (activeTab) searchOpen = true;
      },
      save: () => void saveActiveEdit(),
      toggleEditing: () => void toggleEditing(),
      toggleOutline: () => appState.toggleSidebar(),
      toggleTheme,
      openSettings: () => appState.openSettings(),
    };
  }

  function copyToClipboard(text: string) {
    if (!text) return;
    void writeClipboardText(text).catch(showError);
  }

  async function closeTabsExcept(documentId: string | null) {
    for (const tab of [...appState.tabs]) {
      if (tab.documentId !== documentId) await closeTab(tab.documentId);
    }
  }

  async function followLink(href: string) {
    if (href.startsWith("#")) {
      const heading = activeTab?.headings.find((candidate) => candidate.slug === href.slice(1));
      if (heading) jumpToHeading(heading);
      return;
    }
    try {
      await openExternalUrl(href);
    } catch (error) {
      showError(error);
    }
  }

  function selectAllRegion(region: HTMLElement) {
    const selection = globalThis.getSelection?.();
    if (!selection) return;
    const range = globalThis.document.createRange();
    range.selectNodeContents(region);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function fieldSelection(field: FieldElement) {
    return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
  }

  async function cutField(field: FieldElement) {
    const text = fieldSelection(field);
    if (!text) return;
    try {
      await writeClipboardText(text);
      replaceFieldSelection(field, "");
    } catch (error) {
      showError(error);
    }
  }

  async function pasteIntoField(field: FieldElement) {
    try {
      replaceFieldSelection(field, await readClipboardText());
    } catch (error) {
      showError(error);
    }
  }

  function replaceFieldSelection(field: FieldElement, text: string) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.focus();
    field.setRangeText(text, start, end, "end");
    // Svelte bindings and the search panel both listen for input, not value writes.
    field.dispatchEvent(new Event("input", { bubbles: true }));
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
        inSettings={appState.view === "settings"}
        onOpen={chooseDocuments}
        onOpenSettings={() => {
          settingsFocus = undefined;
          appState.openSettings();
        }}
        onCloseSettings={() => appState.closeSettings()}
        onToggleOutline={() => appState.toggleSidebar()}
        onToggleTheme={toggleTheme}
        editing={Boolean(activeTab?.editing)}
        dirty={Boolean(activeTab?.dirty)}
        saving={activeTab?.editStatus === "saving"}
        onEdit={toggleEditing}
        onSave={saveActiveEdit}
      />
      {#if appState.tabs.length && appState.view !== "settings"}
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
    <button
      type="button"
      class="status-button"
      title={t("settings.about.title")}
      onclick={() => {
        settingsFocus = "about";
        appState.openSettings();
      }}
    >
      {t("status.version", { version: appVersion })}
    </button>
  {/snippet}

  {#if appState.view === "settings"}
    <SettingsView
      {preferences}
      onChange={handlePreferenceChange}
      {updates}
      focusSection={settingsFocus}
    />
  {:else if openingCount > 0 && !activeTab}
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
            actionLabel={activeTab.dirty ? t("change.merge") : t("change.reload")}
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
            initialPercent={preferences.editorSplitPercent}
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
            onSplitEnd={(percent) => handlePreferenceChange("editorSplitPercent", percent)}
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
    <HomeView
      recentFiles={preferences.recentFiles}
      onOpen={chooseDocuments}
      onOpenRecent={(path) => loadDocument(path)}
      onRemoveRecent={(path) =>
        handlePreferenceChange(
          "recentFiles",
          preferences.recentFiles.filter((file) => file.path !== path),
        )}
      onClearRecent={() => handlePreferenceChange("recentFiles", [])}
      onOpenSettings={() => appState.openSettings()}
    />
  {/if}
</AppShell>

{#if contextMenu}
  <!-- Each opening is its own menu: reusing the instance would keep the old placement. -->
  {#key contextMenu}
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      entries={contextMenu.entries}
      onClose={() => (contextMenu = null)}
    />
  {/key}
{/if}

{#if unsavedPrompt}
  {@const names = unsavedPrompt.names}
  {@const scope = unsavedPrompt.scope}
  {@const single = names.length === 1}
  <UnsavedChangesDialog
    open={true}
    title={t("confirm.unsaved.title")}
    message={scope === "app"
      ? single
        ? t("confirm.unsaved.app.single", { name: names[0] })
        : t("confirm.unsaved.app.multiple", { count: names.length })
      : t("confirm.unsaved.tab.message", { name: names[0] })}
    saveLabel={scope === "app"
      ? single
        ? t("confirm.unsaved.saveAndExit")
        : t("confirm.unsaved.saveAllAndExit")
      : t("confirm.unsaved.save")}
    discardLabel={scope === "app"
      ? t("confirm.unsaved.exitWithoutSaving")
      : t("confirm.unsaved.discard")}
    cancelLabel={t("confirm.unsaved.cancel")}
    onSave={() => finishUnsavedDecision("save")}
    onDiscard={() => finishUnsavedDecision("discard")}
    onCancel={() => finishUnsavedDecision("cancel")}
  />
{/if}
