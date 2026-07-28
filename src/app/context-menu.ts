/**
 * The menu model behind LitheMark's own context menu.
 *
 * The webview's native menu is always suppressed, so this module decides which
 * surface was clicked and which commands that surface offers. Keeping it free of
 * Svelte state makes every menu a plain, testable value.
 */

export type ContextSurface = "tab" | "field" | "editor" | "outline" | "document" | "app";

export type FieldElement = HTMLInputElement | HTMLTextAreaElement;

export interface ContextTarget {
  surface: ContextSurface;
  selectionText: string;
  documentId?: string;
  field?: FieldElement;
  region?: HTMLElement;
  linkHref?: string;
}

export interface ContextMenuItem {
  kind: "item";
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

export type ContextMenuEntry = ContextMenuItem | { kind: "separator" };

/** Editor commands the menu drives, implemented by the editor workspace. */
export interface EditorContextCommands {
  hasSelection: () => boolean;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
  find: () => void;
  commandPalette: () => void;
}

export interface ContextMenuActions {
  hasDocument: boolean;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  tabCount: number;
  outlineOpen: boolean;
  editor: EditorContextCommands | null;

  openFile: () => void;
  closeTab: (documentId: string) => void;
  closeOtherTabs: (documentId: string) => void;
  closeAllTabs: () => void;
  copyTabPath: (documentId: string) => void;

  openLink: (href: string) => void;
  copyText: (text: string) => void;
  selectAllRegion: (region: HTMLElement) => void;

  fieldCut: (field: FieldElement) => void;
  fieldCopy: (field: FieldElement) => void;
  fieldPaste: (field: FieldElement) => void;
  fieldSelectAll: (field: FieldElement) => void;

  find: () => void;
  save: () => void;
  toggleEditing: () => void;
  toggleOutline: () => void;
  toggleTheme: () => void;
}

/** Text fields whose caret LitheMark can address for cut, paste and select all. */
const EDITABLE_INPUT_TYPES = new Set(["text", "search", "url", "tel"]);

export function classifyContextTarget(
  node: EventTarget | null,
  selectionText: string,
): ContextTarget {
  const element = node instanceof Element ? node : null;
  const base = { selectionText: selectionText.trim() ? selectionText : "" };

  const tab = element?.closest<HTMLElement>("[data-tab-id]");
  if (tab?.dataset.tabId) {
    return { ...base, surface: "tab", documentId: tab.dataset.tabId };
  }

  const field = element?.closest<FieldElement>("input, textarea");
  if (field && isEditableField(field)) {
    return { ...base, surface: "field", field };
  }

  if (element?.closest(".cm-editor, .editor-host")) {
    return { ...base, surface: "editor" };
  }

  if (element?.closest(".outline-panel")) {
    return { ...base, surface: "outline" };
  }

  const region = element?.closest<HTMLElement>(".markdown-document");
  if (region) {
    return {
      ...base,
      surface: "document",
      region,
      linkHref: element?.closest("a[href]")?.getAttribute("href") ?? undefined,
    };
  }

  return { ...base, surface: "app" };
}

export function buildContextMenu(
  target: ContextTarget,
  actions: ContextMenuActions,
): ContextMenuEntry[] {
  switch (target.surface) {
    case "tab":
      return compact(tabMenu(target.documentId!, actions));
    case "field":
      return compact(fieldMenu(target.field!, actions));
    case "editor":
      return compact(editorMenu(actions));
    case "outline":
      return compact(outlineMenu(actions));
    case "document":
      return compact(documentMenu(target, actions));
    default:
      return compact(appMenu(actions));
  }
}

function tabMenu(documentId: string, actions: ContextMenuActions): ContextMenuEntry[] {
  return [
    item("tab-close", "Close tab", () => actions.closeTab(documentId), { hint: "Ctrl+W" }),
    item("tab-close-others", "Close other tabs", () => actions.closeOtherTabs(documentId), {
      disabled: actions.tabCount < 2,
    }),
    item("tab-close-all", "Close all tabs", () => actions.closeAllTabs()),
    separator(),
    item("tab-copy-path", "Copy file path", () => actions.copyTabPath(documentId)),
  ];
}

function fieldMenu(field: FieldElement, actions: ContextMenuActions): ContextMenuEntry[] {
  const hasSelection = field.selectionStart !== field.selectionEnd;
  return [
    item("field-cut", "Cut", () => actions.fieldCut(field), {
      hint: "Ctrl+X",
      disabled: !hasSelection,
    }),
    item("field-copy", "Copy", () => actions.fieldCopy(field), {
      hint: "Ctrl+C",
      disabled: !hasSelection,
    }),
    item("field-paste", "Paste", () => actions.fieldPaste(field), { hint: "Ctrl+V" }),
    separator(),
    item("field-select-all", "Select all", () => actions.fieldSelectAll(field), { hint: "Ctrl+A" }),
  ];
}

function editorMenu(actions: ContextMenuActions): ContextMenuEntry[] {
  const editor = actions.editor;
  const hasSelection = editor?.hasSelection() ?? false;
  return [
    item("editor-cut", "Cut", () => editor?.cut(), {
      hint: "Ctrl+X",
      disabled: !editor || !hasSelection,
    }),
    item("editor-copy", "Copy", () => editor?.copy(), {
      hint: "Ctrl+C",
      disabled: !editor || !hasSelection,
    }),
    item("editor-paste", "Paste", () => editor?.paste(), { hint: "Ctrl+V", disabled: !editor }),
    separator(),
    item("editor-select-all", "Select all", () => editor?.selectAll(), {
      hint: "Ctrl+A",
      disabled: !editor,
    }),
    separator(),
    item("editor-undo", "Undo", () => editor?.undo(), { hint: "Ctrl+Z", disabled: !editor }),
    item("editor-redo", "Redo", () => editor?.redo(), { hint: "Ctrl+Y", disabled: !editor }),
    separator(),
    item("editor-find", "Find and replace", () => editor?.find(), { disabled: !editor }),
    item("editor-palette", "Command palette", () => editor?.commandPalette(), {
      hint: "Ctrl+Shift+P",
      disabled: !editor,
    }),
    separator(),
    item("editor-save", "Save file", () => actions.save(), {
      hint: "Ctrl+S",
      disabled: !actions.dirty || actions.saving,
    }),
    item("editor-stop", "Stop editing", () => actions.toggleEditing()),
  ];
}

function outlineMenu(actions: ContextMenuActions): ContextMenuEntry[] {
  return [
    item("outline-hide", "Hide outline", () => actions.toggleOutline()),
    separator(),
    item("outline-find", "Find in document", () => actions.find(), {
      hint: "Ctrl+F",
      disabled: !actions.hasDocument,
    }),
    item("outline-open", "Open file…", () => actions.openFile(), { hint: "Ctrl+O" }),
  ];
}

function documentMenu(target: ContextTarget, actions: ContextMenuActions): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  const href = target.linkHref;

  if (href) {
    entries.push(
      item("link-open", href.startsWith("#") ? "Go to section" : "Open link", () =>
        actions.openLink(href),
      ),
      item("link-copy", "Copy link address", () => actions.copyText(href)),
      separator(),
    );
  }

  entries.push(
    item("document-copy", "Copy", () => actions.copyText(target.selectionText), {
      hint: "Ctrl+C",
      disabled: !target.selectionText,
    }),
    item(
      "document-select-all",
      "Select all",
      () => target.region && actions.selectAllRegion(target.region),
      {
        hint: "Ctrl+A",
        disabled: !target.region,
      },
    ),
    separator(),
    item("document-find", "Find in document", () => actions.find(), { hint: "Ctrl+F" }),
    item("document-edit", actions.editing ? "Stop editing" : "Edit document", () =>
      actions.toggleEditing(),
    ),
    item("document-outline", actions.outlineOpen ? "Hide outline" : "Show outline", () =>
      actions.toggleOutline(),
    ),
    separator(),
    item("document-open", "Open file…", () => actions.openFile(), { hint: "Ctrl+O" }),
  );

  return entries;
}

function appMenu(actions: ContextMenuActions): ContextMenuEntry[] {
  return [
    item("app-open", "Open file…", () => actions.openFile(), { hint: "Ctrl+O" }),
    item("app-find", "Find in document", () => actions.find(), {
      hint: "Ctrl+F",
      disabled: !actions.hasDocument,
    }),
    item(
      "app-outline",
      actions.outlineOpen ? "Hide outline" : "Show outline",
      () => actions.toggleOutline(),
      { disabled: !actions.hasDocument },
    ),
    separator(),
    item("app-theme", "Toggle color theme", () => actions.toggleTheme()),
  ];
}

function item(
  id: string,
  label: string,
  run: () => void,
  options: { hint?: string; disabled?: boolean } = {},
): ContextMenuItem {
  return { kind: "item", id, label, run, hint: options.hint, disabled: options.disabled };
}

function separator(): ContextMenuEntry {
  return { kind: "separator" };
}

/** Drops the leading, trailing and repeated separators left by optional items. */
function compact(entries: ContextMenuEntry[]): ContextMenuEntry[] {
  const result: ContextMenuEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "separator" && result.at(-1)?.kind !== "item") continue;
    result.push(entry);
  }
  if (result.at(-1)?.kind === "separator") result.pop();
  return result;
}

function isEditableField(field: FieldElement): boolean {
  if (field.disabled || field.readOnly) return false;
  return field instanceof HTMLTextAreaElement || EDITABLE_INPUT_TYPES.has(field.type);
}
