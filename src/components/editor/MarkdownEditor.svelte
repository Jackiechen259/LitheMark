<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
  } from "@codemirror/autocomplete";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    redo,
    selectAll,
    undo,
  } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import {
    bracketMatching,
    defaultHighlightStyle,
    foldAll,
    foldGutter,
    foldKeymap,
    indentOnInput,
    syntaxHighlighting,
    unfoldAll,
  } from "@codemirror/language";
  import { Annotation, EditorSelection, EditorState, type Extension } from "@codemirror/state";
  import {
    closeSearchPanel,
    gotoLine,
    highlightSelectionMatches,
    openSearchPanel,
    searchKeymap,
  } from "@codemirror/search";
  import {
    crosshairCursor,
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    rectangularSelection,
    type ViewUpdate,
  } from "@codemirror/view";

  import type { EditState, TextEdit } from "../../features/documents/document-types";
  import { t } from "../../features/i18n/i18n.svelte";
  import { readClipboardText, writeClipboardText } from "../../lib/clipboard";

  let {
    source,
    draftRevision,
    onApplyEdits,
    onDirty,
    onSynced,
    onSave,
    onError,
    onSnapshot,
  }: {
    source: string;
    draftRevision: number;
    onApplyEdits: (baseRevision: number, edits: TextEdit[]) => Promise<EditState>;
    onDirty: () => void;
    onSynced: (state: EditState, visibleStartLine: number, visibleEndLine: number) => void;
    onSave: () => void | Promise<void>;
    onError: (error: unknown) => void;
    onSnapshot: (source: string, draftRevision: number) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  let currentDraftRevision = $state(0);
  let syncQueue: Promise<void> = Promise.resolve();
  let paletteOpen = $state(false);
  let paletteQuery = $state("");

  const remoteUpdate = Annotation.define<boolean>();

  type CommandItem = { label: string; run: () => void };
  const commands = $derived(
    [
      { label: t("editor.palette.save"), run: () => void flushAndSave() },
      { label: t("editor.palette.findReplace"), run: () => view && openSearchPanel(view) },
      { label: t("editor.palette.gotoLine"), run: () => view && gotoLine(view) },
      { label: t("editor.palette.undo"), run: () => view && undo(view) },
      { label: t("editor.palette.redo"), run: () => view && redo(view) },
      { label: t("editor.palette.foldAll"), run: () => view && foldAll(view) },
      { label: t("editor.palette.unfoldAll"), run: () => view && unfoldAll(view) },
      {
        label: t("editor.palette.insertLink"),
        run: () => insertSnippet("[text](https://example.com)"),
      },
      {
        label: t("editor.palette.insertImage"),
        run: () => insertSnippet("![alt](images/file.png)"),
      },
      { label: t("editor.palette.insertTask"), run: () => insertSnippet("- [ ] task") },
      { label: t("editor.palette.insertCodeFence"), run: () => insertSnippet("```text\n\n```") },
      {
        label: t("editor.palette.insertTable"),
        run: () => insertSnippet("| Column | Column |\n| --- | --- |\n| Value | Value |"),
      },
    ].filter((command) => command.label.toLowerCase().includes(paletteQuery.trim().toLowerCase())),
  );

  onMount(() => {
    currentDraftRevision = draftRevision;
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      markdown(),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            void flushAndSave();
            return true;
          },
        },
        {
          key: "Mod-Shift-p",
          run: () => {
            paletteOpen = true;
            return true;
          },
        },
        {
          key: "F1",
          run: () => {
            paletteOpen = true;
            return true;
          },
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
      ]),
      EditorView.updateListener.of(handleViewUpdate),
      EditorView.theme({
        "&": { height: "100%", fontSize: "14px" },
        ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
        ".cm-content": { padding: "1rem 0 5rem" },
        ".cm-gutters": {
          backgroundColor: "var(--surface-app)",
          color: "var(--text-secondary)",
          borderRight: "1px solid var(--border-subtle)",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
        },
      }),
    ];
    view = new EditorView({
      doc: source,
      extensions,
      parent: host,
    });
    view.focus();
  });

  onDestroy(() => {
    if (view) {
      onSnapshot(view.state.doc.toString(), currentDraftRevision);
      view.destroy();
    }
  });

  function handleViewUpdate(update: ViewUpdate) {
    if (
      update.docChanged &&
      !update.transactions.some((transaction) => transaction.annotation(remoteUpdate))
    ) {
      onDirty();
      for (const transaction of update.transactions) {
        if (!transaction.docChanged) continue;
        const edits: TextEdit[] = [];
        transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const fromLine = transaction.startState.doc.lineAt(fromA);
          const toLine = transaction.startState.doc.lineAt(toA);
          edits.push({
            from: { line: fromLine.number - 1, utf16Column: fromA - fromLine.from },
            to: { line: toLine.number - 1, utf16Column: toA - toLine.from },
            insert: inserted.toString(),
          });
        });
        syncQueue = syncQueue
          .then(async () => {
            const state = await onApplyEdits(currentDraftRevision, edits);
            currentDraftRevision = state.draftRevision;
            const visible = visibleLines();
            onSynced(state, visible.start, visible.end);
          })
          .catch(onError);
      }
    } else if (update.viewportChanged) {
      const visible = visibleLines();
      onSynced(
        {
          documentId: "",
          draftRevision: currentDraftRevision,
          totalChars: update.state.doc.length,
          lineCount: update.state.doc.lines,
          dirty: true,
        },
        visible.start,
        visible.end,
      );
    }
  }

  function visibleLines() {
    if (!view) return { start: 0, end: 1 };
    return {
      start: Math.max(0, view.state.doc.lineAt(view.viewport.from).number - 1),
      end: view.state.doc.lineAt(view.viewport.to).number,
    };
  }

  async function flushAndSave() {
    await syncQueue;
    await onSave();
  }

  function insertSnippet(text: string) {
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  function runCommand(command: CommandItem) {
    paletteOpen = false;
    paletteQuery = "";
    command.run();
    view?.focus();
  }

  export function replaceDocument(content: string, revision: number) {
    if (!view) return;
    currentDraftRevision = revision;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      annotations: remoteUpdate.of(true),
      selection: EditorSelection.cursor(0),
    });
  }

  export function setDraftRevision(revision: number) {
    currentDraftRevision = revision;
  }

  export function hasConflictMarkers() {
    const content = view?.state.doc.toString() ?? source;
    return /^<<<<<<< |^\|\|\|\|\|\|\| |^=======\s*$|^>>>>>>> /m.test(content);
  }

  export function hasSelection() {
    return view ? !view.state.selection.main.empty : false;
  }

  export async function copySelection() {
    if (!view || view.state.selection.main.empty) return false;
    const { from, to } = view.state.selection.main;
    try {
      await writeClipboardText(view.state.sliceDoc(from, to));
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  }

  export async function cutSelection() {
    if (!view || !(await copySelection())) return;
    view.dispatch(view.state.replaceSelection(""));
    view.focus();
  }

  export async function pasteClipboard() {
    if (!view) return;
    try {
      const text = await readClipboardText();
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    } catch (error) {
      onError(error);
    }
  }

  export function selectAllText() {
    if (!view) return;
    selectAll(view);
    view.focus();
  }

  export function undoEdit() {
    if (!view) return;
    undo(view);
    view.focus();
  }

  export function redoEdit() {
    if (!view) return;
    redo(view);
    view.focus();
  }

  export function openFind() {
    if (view) openSearchPanel(view);
  }

  export function openCommandPalette() {
    paletteOpen = true;
  }
</script>

<div class="editor-host" bind:this={host} aria-label={t("editor.aria.source")}></div>

{#if paletteOpen}
  <div class="command-backdrop" role="presentation" onclick={() => (paletteOpen = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.palette.title")}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
    >
      <input
        aria-label={t("editor.palette.search")}
        placeholder={t("editor.palette.placeholder")}
        bind:value={paletteQuery}
        onkeydown={(event) => {
          if (event.key === "Escape") {
            paletteOpen = false;
            if (view) closeSearchPanel(view);
          } else if (event.key === "Enter" && commands[0]) {
            runCommand(commands[0]);
          }
        }}
      />
      <div role="listbox" aria-label={t("editor.palette.commands")}>
        {#each commands as command}
          <button
            type="button"
            role="option"
            aria-selected="false"
            onclick={() => runCommand(command)}>{command.label}</button
          >
        {/each}
      </div>
    </div>
  </div>
{/if}
