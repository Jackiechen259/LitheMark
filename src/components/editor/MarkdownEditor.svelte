<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
  } from "@codemirror/autocomplete";
  import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
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
      { label: "Save document", run: () => void flushAndSave() },
      { label: "Find or replace", run: () => view && openSearchPanel(view) },
      { label: "Go to line", run: () => view && gotoLine(view) },
      { label: "Undo", run: () => view && undo(view) },
      { label: "Redo", run: () => view && redo(view) },
      { label: "Fold all", run: () => view && foldAll(view) },
      { label: "Unfold all", run: () => view && unfoldAll(view) },
      { label: "Insert link", run: () => insertSnippet("[text](https://example.com)") },
      { label: "Insert image", run: () => insertSnippet("![alt](images/file.png)") },
      { label: "Insert task", run: () => insertSnippet("- [ ] task") },
      { label: "Insert code fence", run: () => insertSnippet("```text\n\n```") },
      {
        label: "Insert table",
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
</script>

<div class="editor-host" bind:this={host} aria-label="Markdown source editor"></div>

{#if paletteOpen}
  <div class="command-backdrop" role="presentation" onclick={() => (paletteOpen = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
    >
      <input
        aria-label="Search commands"
        placeholder="Type a command…"
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
      <div role="listbox" aria-label="Commands">
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
