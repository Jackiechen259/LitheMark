<script lang="ts">
  import { t } from "../../features/i18n/i18n.svelte";

  let {
    sections,
    activeId,
    onSelect,
  }: {
    sections: { id: string; label: string }[];
    activeId: string;
    onSelect: (id: string) => void;
  } = $props();
</script>

<nav class="settings-nav" aria-label={t("settings.nav.aria")}>
  {#each sections as section (section.id)}
    <button
      type="button"
      class="settings-nav-item"
      aria-current={section.id === activeId ? "true" : undefined}
      onclick={() => onSelect(section.id)}
    >
      {section.label}
    </button>
  {/each}
</nav>
