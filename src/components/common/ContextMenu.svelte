<script lang="ts">
  import { onMount } from "svelte";

  import type { ContextMenuEntry, ContextMenuItem } from "../../app/context-menu";

  let {
    x,
    y,
    entries,
    onClose,
  }: {
    x: number;
    y: number;
    entries: ContextMenuEntry[];
    onClose: () => void;
  } = $props();

  const MARGIN = 8;

  let menu = $state<HTMLDivElement | null>(null);
  // The menu opens at the pointer and only shifts once its own size is known, so a
  // measurement that never arrives still leaves a usable menu on screen.
  let nudged = $state<{ left: number; top: number } | null>(null);
  let activeIndex = $state(-1);
  let activated = false;

  const left = $derived(nudged?.left ?? x);
  const top = $derived(nudged?.top ?? y);
  const enabledIndexes = $derived(
    entries.flatMap((entry, index) => (entry.kind === "item" && !entry.disabled ? [index] : [])),
  );

  onMount(() => {
    const previous = globalThis.document.activeElement;
    // The whole subtree is in the DOM by now, so it can be measured and focused at once.
    clampIntoViewport();
    activeIndex = enabledIndexes[0] ?? -1;
    focusActiveItem();

    // Element scroll never bubbles, so the capture phase is the only way to hear it.
    const dismiss = () => onClose();
    globalThis.addEventListener("scroll", dismiss, true);

    return () => {
      globalThis.removeEventListener("scroll", dismiss, true);
      // Running a command hands focus to whatever that command opened.
      if (!activated && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  });

  function focusActiveItem() {
    if (activeIndex < 0) return;
    menu?.querySelector<HTMLButtonElement>(`[data-index="${activeIndex}"]`)?.focus();
  }

  function clampIntoViewport() {
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(MARGIN, globalThis.innerWidth - rect.width - MARGIN);
    const maxTop = Math.max(MARGIN, globalThis.innerHeight - rect.height - MARGIN);
    nudged = {
      left: Math.min(Math.max(MARGIN, x), maxLeft),
      top: Math.min(Math.max(MARGIN, y), maxTop),
    };
  }

  function activate(entry: ContextMenuItem) {
    if (entry.disabled) return;
    activated = true;
    onClose();
    entry.run();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key) || !enabledIndexes.length) return;
    event.preventDefault();
    event.stopPropagation();

    const position = enabledIndexes.indexOf(activeIndex);
    if (event.key === "Home") activeIndex = enabledIndexes[0];
    else if (event.key === "End") activeIndex = enabledIndexes[enabledIndexes.length - 1];
    else if (event.key === "ArrowDown")
      activeIndex = enabledIndexes[(position + 1) % enabledIndexes.length];
    else
      activeIndex =
        enabledIndexes[
          (position < 0 ? 0 : position - 1 + enabledIndexes.length) % enabledIndexes.length
        ];
    focusActiveItem();
  }

  function handleWindowPointerDown(event: PointerEvent) {
    if (event.target instanceof Node && menu?.contains(event.target)) return;
    onClose();
  }
</script>

<svelte:window
  onpointerdown={handleWindowPointerDown}
  onblur={() => onClose()}
  onresize={() => onClose()}
/>

<div
  bind:this={menu}
  class="context-menu"
  role="menu"
  tabindex="-1"
  aria-label="Context menu"
  style={`left: ${left}px; top: ${top}px`}
  onkeydown={handleKeydown}
>
  {#each entries as entry, index (index)}
    {#if entry.kind === "separator"}
      <div class="context-menu-separator" role="separator"></div>
    {:else}
      <button
        type="button"
        role="menuitem"
        class="context-menu-item"
        data-index={index}
        disabled={entry.disabled}
        tabindex={index === activeIndex ? 0 : -1}
        onclick={() => activate(entry)}
        onpointerenter={() => {
          if (entry.disabled) return;
          activeIndex = index;
          focusActiveItem();
        }}
      >
        <span class="context-menu-label">{entry.label}</span>
        {#if entry.hint}<span class="context-menu-hint">{entry.hint}</span>{/if}
      </button>
    {/if}
  {/each}
</div>
