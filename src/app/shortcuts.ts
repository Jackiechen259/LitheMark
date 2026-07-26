export interface ShortcutActions {
  open: () => void;
  closeActive: () => void;
  nextTab: () => void;
  previousTab: () => void;
}

export function handleShortcut(event: KeyboardEvent, actions: ShortcutActions) {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;

  const key = event.key.toLowerCase();
  if (key === "o") {
    event.preventDefault();
    actions.open();
  } else if (key === "w") {
    event.preventDefault();
    actions.closeActive();
  } else if (event.key === "Tab") {
    event.preventDefault();
    if (event.shiftKey) actions.previousTab();
    else actions.nextTab();
  }
}
