/**
 * Clipboard access for LitheMark's own context menu.
 *
 * The app ships no clipboard plugin, so these helpers use the webview clipboard
 * and fall back to the legacy `execCommand` path when the async API is missing.
 */

export async function writeClipboardText(text: string): Promise<void> {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Older webviews expose no async clipboard; the legacy path still works.
  }

  if (!copyThroughSelection(text)) {
    throw new Error("LitheMark could not write to the clipboard.");
  }
}

export async function readClipboardText(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    if (typeof text === "string") return text;
  } catch {
    // Reads are the permission-gated half of the clipboard; guide the user instead.
  }

  throw new Error("LitheMark could not read the clipboard. Press Ctrl+V to paste instead.");
}

function copyThroughSelection(text: string): boolean {
  const owner = globalThis.document;
  if (typeof owner?.execCommand !== "function") return false;

  const selection = owner.getSelection();
  const saved = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    : [];

  const scratch = owner.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("aria-hidden", "true");
  scratch.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
  owner.body.append(scratch);
  scratch.select();

  let copied = false;
  try {
    copied = owner.execCommand("copy");
  } catch {
    copied = false;
  }
  scratch.remove();

  // The scratch element stole the caret; hand the original selection back.
  if (selection) {
    selection.removeAllRanges();
    for (const range of saved) selection.addRange(range);
  }
  return copied;
}
