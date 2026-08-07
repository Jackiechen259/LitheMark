export interface ShortcutActions {
  open: () => void;
  closeActive: () => void;
  nextTab: () => void;
  previousTab: () => void;
  find: () => void;
  save: () => void;
  openSettings: () => void;
}

export function handleShortcut(event: KeyboardEvent, actions: ShortcutActions) {
  if (event.defaultPrevented) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;

  const key = event.key.toLowerCase();
  if (key === "o") {
    event.preventDefault();
    actions.open();
  } else if (key === "w") {
    event.preventDefault();
    actions.closeActive();
  } else if (key === "f") {
    event.preventDefault();
    actions.find();
  } else if (key === "s") {
    event.preventDefault();
    actions.save();
  } else if (key === ",") {
    event.preventDefault();
    actions.openSettings();
  } else if (event.key === "Tab") {
    event.preventDefault();
    if (event.shiftKey) actions.previousTab();
    else actions.nextTab();
  }
}
