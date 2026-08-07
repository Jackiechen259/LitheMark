<script lang="ts">
  import MarkdownBlock from "../document/MarkdownBlock.svelte";
  import MarkdownEditor from "./MarkdownEditor.svelte";
  import { openExternalUrl } from "../../features/documents/document-service";
  import type {
    DocumentTab,
    DraftPreview,
    EditState,
    TextEdit,
  } from "../../features/documents/document-types";
  import { t } from "../../features/i18n/i18n.svelte";
  import { normalizeAppError } from "../../lib/errors";

  let {
    tab,
    source,
    draftRevision,
    initialPercent = 50,
    onApplyEdits,
    onDirty,
    onPreview,
    onSave,
    onError,
    onSnapshot,
    onSplitEnd,
  }: {
    tab: DocumentTab;
    source: string;
    draftRevision: number;
    initialPercent?: number;
    onApplyEdits: (baseRevision: number, edits: TextEdit[]) => Promise<EditState>;
    onDirty: () => void;
    onPreview: (
      draftRevision: number,
      startLine?: number,
      endLine?: number,
    ) => Promise<DraftPreview>;
    onSave: () => void | Promise<void>;
    onError: (error: unknown) => void;
    onSnapshot: (source: string, draftRevision: number) => void;
    onSplitEnd?: (percent: number) => void;
  } = $props();

  let editor: MarkdownEditor;
  let preview = $state<DraftPreview | null>(null);
  let previewBusy = $state(false);
  let previewTimer: number | undefined;
  let requestNonce = 0;
  // Seed the split from the persisted preference once; later drags own the value.
  // svelte-ignore state_referenced_locally
  let editorPercent = $state(initialPercent);

  function schedulePreview(state: EditState, visibleStart: number, visibleEnd: number) {
    window.clearTimeout(previewTimer);
    const delay = tab.metadata.mode === "virtualized" ? 750 : 250;
    previewTimer = window.setTimeout(() => {
      const partial = tab.metadata.mode !== "full";
      const context = tab.metadata.mode === "huge" ? 100 : 200;
      const start = partial ? Math.max(0, visibleStart - context) : undefined;
      const end = partial ? visibleEnd + context : undefined;
      void refreshPreview(state.draftRevision, start, end);
    }, delay);
  }

  async function refreshPreview(revision: number, startLine?: number, endLine?: number) {
    const nonce = ++requestNonce;
    previewBusy = true;
    try {
      const result = await onPreview(revision, startLine, endLine);
      if (nonce === requestNonce) preview = result;
    } catch (error) {
      onError(error);
    } finally {
      if (nonce === requestNonce) previewBusy = false;
    }
  }

  function resize(event: PointerEvent) {
    const container = (event.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    editorPercent = Math.max(
      25,
      Math.min(75, ((event.clientX - bounds.left) / bounds.width) * 100),
    );
  }

  function beginResize(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => resize(next);
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      // Persist only when the drag finishes, not on every pointer move.
      onSplitEnd?.(editorPercent);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
  }

  async function handlePreviewClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element) || !(event.currentTarget instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    if (href.startsWith("#")) {
      globalThis.document.getElementById(href.slice(1))?.scrollIntoView({ block: "start" });
      return;
    }
    try {
      await openExternalUrl(href);
    } catch (error) {
      onError(normalizeAppError(error));
    }
  }

  function interceptLinks(node: HTMLElement) {
    node.addEventListener("click", handlePreviewClick);
    return {
      destroy() {
        node.removeEventListener("click", handlePreviewClick);
      },
    };
  }

  export function replaceDocument(content: string, revision: number) {
    editor.replaceDocument(content, revision);
    void refreshPreview(revision);
  }

  export function hasConflictMarkers() {
    return editor.hasConflictMarkers();
  }

  export function setDraftRevision(revision: number) {
    editor.setDraftRevision(revision);
  }

  export function hasSelection() {
    return editor.hasSelection();
  }

  export function cut() {
    void editor.cutSelection();
  }

  export function copy() {
    void editor.copySelection();
  }

  export function paste() {
    void editor.pasteClipboard();
  }

  export function selectAll() {
    editor.selectAllText();
  }

  export function undo() {
    editor.undoEdit();
  }

  export function redo() {
    editor.redoEdit();
  }

  export function find() {
    editor.openFind();
  }

  export function commandPalette() {
    editor.openCommandPalette();
  }
</script>

<div class="editor-workspace" style={`--editor-percent: ${editorPercent}%`}>
  <section class="source-pane" aria-label={t("editor.aria.editor")}>
    <MarkdownEditor
      bind:this={editor}
      {source}
      {draftRevision}
      {onApplyEdits}
      {onDirty}
      onSynced={schedulePreview}
      {onSave}
      {onError}
      {onSnapshot}
    />
  </section>
  <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
  <button
    type="button"
    class="splitter"
    role="separator"
    aria-label={t("editor.aria.resize")}
    aria-orientation="vertical"
    aria-valuenow={Math.round(editorPercent)}
    tabindex="0"
    onpointerdown={beginResize}
    onkeydown={(event) => {
      if (event.key === "ArrowLeft") editorPercent = Math.max(25, editorPercent - 5);
      else if (event.key === "ArrowRight") editorPercent = Math.min(75, editorPercent + 5);
      else return;
      onSplitEnd?.(editorPercent);
    }}
  ></button>
  <section class="preview-pane" aria-label={t("editor.aria.preview")}>
    <div class="preview-heading">
      <strong>{t("editor.preview")}</strong>
      {#if previewBusy}<span>{t("editor.updating")}</span>{/if}
      {#if preview && tab.metadata.mode !== "full"}
        <span>{t("editor.lines", { start: preview.startLine + 1, end: preview.endLine })}</span>
      {/if}
    </div>
    <div class="draft-preview-scroll">
      <article class="markdown-document draft-preview" use:interceptLinks>
        {#if preview}
          {#each preview.blocks as block (block.id)}
            <MarkdownBlock {block} documentId={tab.documentId} />
          {/each}
        {:else}
          {#each tab.blocks as block (block.id)}
            <MarkdownBlock {block} documentId={tab.documentId} />
          {/each}
        {/if}
      </article>
    </div>
  </section>
</div>
