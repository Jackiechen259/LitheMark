/**
 * The menu model behind LitheMark's own context menu.
 *
 * The webview's native menu is always suppressed, so this module decides which
 * surface was clicked and which commands that surface offers. Keeping it free of
 * Svelte state makes every menu a plain, testable value. Labels arrive via the
 * `t` translator parameter so the module stays a pure consumer of i18n.
 */
import type { MessageKey } from "../features/i18n/messages/en";

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

/** Translator shape this module consumes; the real `t` satisfies it. */
export type Translator = (key: MessageKey) => string;

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
  openSettings: () => void;
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
  t: Translator,
): ContextMenuEntry[] {
  switch (target.surface) {
    case "tab":
      return compact(tabMenu(target.documentId!, actions, t));
    case "field":
      return compact(fieldMenu(target.field!, actions, t));
    case "editor":
      return compact(editorMenu(actions, t));
    case "outline":
      return compact(outlineMenu(actions, t));
    case "document":
      return compact(documentMenu(target, actions, t));
    default:
      return compact(appMenu(actions, t));
  }
}

function tabMenu(
  documentId: string,
  actions: ContextMenuActions,
  t: Translator,
): ContextMenuEntry[] {
  return [
    item("tab-close", "context.tab.close", t, () => actions.closeTab(documentId), {
      hint: "Ctrl+W",
    }),
    item(
      "tab-close-others",
      "context.tab.closeOthers",
      t,
      () => actions.closeOtherTabs(documentId),
      {
        disabled: actions.tabCount < 2,
      },
    ),
    item("tab-close-all", "context.tab.closeAll", t, () => actions.closeAllTabs()),
    separator(),
    item("tab-copy-path", "context.tab.copyPath", t, () => actions.copyTabPath(documentId)),
  ];
}

function fieldMenu(
  field: FieldElement,
  actions: ContextMenuActions,
  t: Translator,
): ContextMenuEntry[] {
  const hasSelection = field.selectionStart !== field.selectionEnd;
  return [
    item("field-cut", "context.cut", t, () => actions.fieldCut(field), {
      hint: "Ctrl+X",
      disabled: !hasSelection,
    }),
    item("field-copy", "context.copy", t, () => actions.fieldCopy(field), {
      hint: "Ctrl+C",
      disabled: !hasSelection,
    }),
    item("field-paste", "context.paste", t, () => actions.fieldPaste(field), { hint: "Ctrl+V" }),
    separator(),
    item("field-select-all", "context.selectAll", t, () => actions.fieldSelectAll(field), {
      hint: "Ctrl+A",
    }),
  ];
}

function editorMenu(actions: ContextMenuActions, t: Translator): ContextMenuEntry[] {
  const editor = actions.editor;
  const hasSelection = editor?.hasSelection() ?? false;
  return [
    item("editor-cut", "context.cut", t, () => editor?.cut(), {
      hint: "Ctrl+X",
      disabled: !editor || !hasSelection,
    }),
    item("editor-copy", "context.copy", t, () => editor?.copy(), {
      hint: "Ctrl+C",
      disabled: !editor || !hasSelection,
    }),
    item("editor-paste", "context.paste", t, () => editor?.paste(), {
      hint: "Ctrl+V",
      disabled: !editor,
    }),
    separator(),
    item("editor-select-all", "context.selectAll", t, () => editor?.selectAll(), {
      hint: "Ctrl+A",
      disabled: !editor,
    }),
    separator(),
    item("editor-undo", "context.undo", t, () => editor?.undo(), {
      hint: "Ctrl+Z",
      disabled: !editor,
    }),
    item("editor-redo", "context.redo", t, () => editor?.redo(), {
      hint: "Ctrl+Y",
      disabled: !editor,
    }),
    separator(),
    item("editor-find", "context.findReplace", t, () => editor?.find(), { disabled: !editor }),
    item("editor-palette", "context.commandPalette", t, () => editor?.commandPalette(), {
      hint: "Ctrl+Shift+P",
      disabled: !editor,
    }),
    separator(),
    item("editor-save", "context.saveFile", t, () => actions.save(), {
      hint: "Ctrl+S",
      disabled: !actions.dirty || actions.saving,
    }),
    item("editor-stop", "context.stopEditing", t, () => actions.toggleEditing()),
  ];
}

function outlineMenu(actions: ContextMenuActions, t: Translator): ContextMenuEntry[] {
  return [
    item("outline-hide", "context.hideOutline", t, () => actions.toggleOutline()),
    separator(),
    item("outline-find", "context.findInDocument", t, () => actions.find(), {
      hint: "Ctrl+F",
      disabled: !actions.hasDocument,
    }),
    item("outline-open", "context.openFile", t, () => actions.openFile(), { hint: "Ctrl+O" }),
  ];
}

function documentMenu(
  target: ContextTarget,
  actions: ContextMenuActions,
  t: Translator,
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  const href = target.linkHref;

  if (href) {
    entries.push(
      item("link-open", href.startsWith("#") ? "context.goToSection" : "context.openLink", t, () =>
        actions.openLink(href),
      ),
      item("link-copy", "context.copyLinkAddress", t, () => actions.copyText(href)),
      separator(),
    );
  }

  entries.push(
    item("document-copy", "context.copy", t, () => actions.copyText(target.selectionText), {
      hint: "Ctrl+C",
      disabled: !target.selectionText,
    }),
    item(
      "document-select-all",
      "context.selectAll",
      t,
      () => target.region && actions.selectAllRegion(target.region),
      {
        hint: "Ctrl+A",
        disabled: !target.region,
      },
    ),
    separator(),
    item("document-find", "context.findInDocument", t, () => actions.find(), { hint: "Ctrl+F" }),
    item("document-edit", actions.editing ? "context.stopEditing" : "context.editDocument", t, () =>
      actions.toggleEditing(),
    ),
    item(
      "document-outline",
      actions.outlineOpen ? "context.hideOutline" : "context.showOutline",
      t,
      () => actions.toggleOutline(),
    ),
    separator(),
    item("document-open", "context.openFile", t, () => actions.openFile(), { hint: "Ctrl+O" }),
  );

  return entries;
}

function appMenu(actions: ContextMenuActions, t: Translator): ContextMenuEntry[] {
  return [
    item("app-open", "context.openFile", t, () => actions.openFile(), { hint: "Ctrl+O" }),
    item("app-find", "context.findInDocument", t, () => actions.find(), {
      hint: "Ctrl+F",
      disabled: !actions.hasDocument,
    }),
    item(
      "app-outline",
      actions.outlineOpen ? "context.hideOutline" : "context.showOutline",
      t,
      () => actions.toggleOutline(),
      { disabled: !actions.hasDocument },
    ),
    separator(),
    item("app-theme", "context.toggleTheme", t, () => actions.toggleTheme()),
    item("app-settings", "context.openSettings", t, () => actions.openSettings(), {
      hint: "Ctrl+,",
    }),
  ];
}

function item(
  id: string,
  labelKey: MessageKey,
  t: Translator,
  run: () => void,
  options: { hint?: string; disabled?: boolean } = {},
): ContextMenuItem {
  return {
    kind: "item",
    id,
    label: t(labelKey),
    run,
    hint: options.hint,
    disabled: options.disabled,
  };
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
