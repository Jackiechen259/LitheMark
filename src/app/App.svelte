<script lang="ts">
  import EmptyState from "../components/common/EmptyState.svelte";
  import ErrorNotice from "../components/common/ErrorNotice.svelte";
  import DocumentLoading from "../components/document/DocumentLoading.svelte";
  import DocumentView from "../components/document/DocumentView.svelte";
  import AppShell from "../components/shell/AppShell.svelte";
  import Toolbar from "../components/shell/Toolbar.svelte";
  import { openDocument, selectMarkdownFile } from "../features/documents/document-service";
  import type { RenderedDocument, Theme, ViewStatus } from "../features/documents/document-types";
  import { normalizeAppError } from "../lib/errors";

  let activeDocument = $state<RenderedDocument | null>(null);
  let status = $state<ViewStatus>("idle");
  let errorMessage = $state("");
  let attemptedPath = $state<string | null>(null);
  let theme = $state<Theme>("light");

  const statusText = $derived(
    activeDocument
      ? `${activeDocument.encoding} · ${formatBytes(activeDocument.byteSize)} · ${activeDocument.lineCount.toLocaleString()} lines`
      : status === "loading"
        ? "Opening document…"
        : "Ready",
  );

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    document.title = activeDocument ? `${activeDocument.name} — LitheMark` : "LitheMark";
  });

  async function chooseDocument() {
    try {
      const path = await selectMarkdownFile();
      if (path) {
        await loadDocument(path);
      }
    } catch (error) {
      showError(error);
    }
  }

  async function loadDocument(path: string) {
    attemptedPath = path;
    status = "loading";
    errorMessage = "";

    try {
      activeDocument = await openDocument(path);
      status = "ready";
    } catch (error) {
      showError(error);
    }
  }

  function showError(error: unknown) {
    status = "error";
    errorMessage = normalizeAppError(error).message;
  }

  function reportLinkError(message: string) {
    errorMessage = message;
  }

  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<AppShell status={statusText}>
  {#snippet header()}
    <Toolbar
      title={activeDocument?.name ?? "LitheMark"}
      path={activeDocument?.displayPath}
      {theme}
      onOpen={chooseDocument}
      onToggleTheme={toggleTheme}
    />
  {/snippet}

  {#if status === "loading"}
    <DocumentLoading />
  {:else if status === "error"}
    <ErrorNotice
      message={errorMessage}
      onRetry={attemptedPath ? () => loadDocument(attemptedPath!) : undefined}
      onChoose={chooseDocument}
    />
  {:else if activeDocument}
    <div class="document-stack">
      {#if errorMessage}
        <ErrorNotice compact message={errorMessage} onDismiss={() => (errorMessage = "")} />
      {/if}
      <DocumentView document={activeDocument} onExternalError={reportLinkError} />
    </div>
  {:else}
    <EmptyState onOpen={chooseDocument} />
  {/if}
</AppShell>
