<script lang="ts">
  import { onMount } from "svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import { appConfigDir } from "@tauri-apps/api/path";

  import { activeLocale, t } from "../../features/i18n/i18n.svelte";
  import type {
    AppPreferences,
    ContentFont,
    ThemePreference,
  } from "../../features/documents/document-types";
  import type { LocalePreference } from "../../features/i18n/i18n.svelte";
  import type { UpdateController } from "../../features/updates/update-state.svelte";
  import { formatRelativeTime } from "../../lib/format";
  import SettingsNav from "./SettingsNav.svelte";
  import SettingsRow from "./SettingsRow.svelte";

  let {
    preferences,
    onChange,
    updates,
    focusSection,
  }: {
    preferences: AppPreferences;
    onChange: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void;
    updates: UpdateController;
    focusSection?: string;
  } = $props();

  let activeSection = $state("appearance");
  let version = $state("-");
  let configPath = $state("-");
  let scrollContainer = $state<HTMLElement | null>(null);

  const locale = $derived(activeLocale());

  const sections = $derived([
    { id: "appearance", label: t("settings.appearance.title") },
    { id: "behavior", label: t("settings.behavior.title") },
    { id: "recent", label: t("settings.recent.title") },
    { id: "updates", label: t("settings.updates.title") },
    { id: "about", label: t("settings.about.title") },
  ]);

  const themeOptions: {
    value: ThemePreference;
    labelKey:
      | "settings.appearance.theme.light"
      | "settings.appearance.theme.dark"
      | "settings.appearance.theme.system";
  }[] = [
    { value: "light", labelKey: "settings.appearance.theme.light" },
    { value: "dark", labelKey: "settings.appearance.theme.dark" },
    { value: "system", labelKey: "settings.appearance.theme.system" },
  ];

  const localeOptions: {
    value: LocalePreference;
    labelKey:
      | "settings.appearance.locale.en"
      | "settings.appearance.locale.zh"
      | "settings.appearance.locale.system";
  }[] = [
    { value: "en", labelKey: "settings.appearance.locale.en" },
    { value: "zh", labelKey: "settings.appearance.locale.zh" },
    { value: "system", labelKey: "settings.appearance.locale.system" },
  ];

  const fontOptions: {
    value: ContentFont;
    labelKey: "settings.appearance.contentFont.serif" | "settings.appearance.contentFont.sans";
  }[] = [
    { value: "serif", labelKey: "settings.appearance.contentFont.serif" },
    { value: "sans", labelKey: "settings.appearance.contentFont.sans" },
  ];

  const updateBusy = $derived(
    updates.status === "checking" ||
      updates.status === "downloading" ||
      updates.status === "installing",
  );
  const updateActionLabel = $derived(
    updates.status === "checking"
      ? t("settings.updates.checking")
      : updates.status === "upToDate"
        ? t("settings.updates.upToDate")
        : t("settings.updates.checkNow"),
  );

  onMount(() => {
    void getVersion()
      .then((value) => (version = value))
      .catch(() => {
        // The browser test host has no Tauri app metadata.
      });
    void appConfigDir()
      .then((value) => (configPath = value))
      .catch(() => {
        // The browser test host has no Tauri path API.
      });

    // Jump to the section the entry point asked for (e.g. About from the status bar version).
    if (focusSection) {
      scrollContainer
        ?.querySelector(`#settings-section-${focusSection}`)
        ?.scrollIntoView({ block: "start" });
    }

    const container = scrollContainer;
    if (!container || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          activeSection = visible[0].target.id.replace(/^settings-section-/, "");
        }
      },
      { root: container, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    for (const id of sections.map((section) => section.id)) {
      const element = container.querySelector(`#settings-section-${id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  });

  function scrollToSection(id: string) {
    scrollContainer
      ?.querySelector(`#settings-section-${id}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function removeRecentFile(path: string) {
    onChange(
      "recentFiles",
      preferences.recentFiles.filter((file) => file.path !== path),
    );
  }

  function clearRecentFiles() {
    onChange("recentFiles", []);
  }
</script>

<div class="settings-view">
  <SettingsNav {sections} activeId={activeSection} onSelect={scrollToSection} />
  <div class="settings-content" bind:this={scrollContainer}>
    <section id="settings-section-appearance" class="settings-section">
      <h2>{t("settings.appearance.title")}</h2>
      <SettingsRow label={t("settings.appearance.theme")}>
        <div class="segmented" role="group" aria-label={t("settings.appearance.theme")}>
          {#each themeOptions as option (option.value)}
            <button
              type="button"
              class="segmented-item"
              aria-pressed={preferences.theme === option.value}
              class:active={preferences.theme === option.value}
              onclick={() => onChange("theme", option.value)}
            >
              {t(option.labelKey)}
            </button>
          {/each}
        </div>
      </SettingsRow>
      <SettingsRow label={t("settings.appearance.locale")}>
        <div class="segmented" role="group" aria-label={t("settings.appearance.locale")}>
          {#each localeOptions as option (option.value)}
            <button
              type="button"
              class="segmented-item"
              aria-pressed={preferences.locale === option.value}
              class:active={preferences.locale === option.value}
              onclick={() => onChange("locale", option.value)}
            >
              {t(option.labelKey)}
            </button>
          {/each}
        </div>
      </SettingsRow>
      <SettingsRow label={t("settings.appearance.contentFontSize")}>
        <div class="settings-range">
          <input
            type="range"
            min="0.85"
            max="1.4"
            step="0.01"
            value={preferences.contentFontSize}
            aria-label={t("settings.appearance.contentFontSize")}
            oninput={(event) => onChange("contentFontSize", event.currentTarget.valueAsNumber)}
          />
          <span class="range-value">{preferences.contentFontSize.toFixed(2)} rem</span>
        </div>
      </SettingsRow>
      <SettingsRow label={t("settings.appearance.contentWidth")}>
        <div class="settings-range">
          <input
            type="range"
            min="36"
            max="72"
            step="1"
            value={preferences.contentWidth}
            aria-label={t("settings.appearance.contentWidth")}
            oninput={(event) => onChange("contentWidth", event.currentTarget.valueAsNumber)}
          />
          <span class="range-value">{preferences.contentWidth} rem</span>
        </div>
      </SettingsRow>
      <SettingsRow label={t("settings.appearance.contentFont")}>
        <div class="segmented" role="group" aria-label={t("settings.appearance.contentFont")}>
          {#each fontOptions as option (option.value)}
            <button
              type="button"
              class="segmented-item"
              aria-pressed={preferences.contentFont === option.value}
              class:active={preferences.contentFont === option.value}
              onclick={() => onChange("contentFont", option.value)}
            >
              {t(option.labelKey)}
            </button>
          {/each}
        </div>
      </SettingsRow>
    </section>

    <section id="settings-section-behavior" class="settings-section">
      <h2>{t("settings.behavior.title")}</h2>
      <SettingsRow label={t("settings.behavior.outlineOpenByDefault")}>
        <input
          type="checkbox"
          class="settings-checkbox"
          aria-label={t("settings.behavior.outlineOpenByDefault")}
          checked={preferences.outlineOpenByDefault}
          onchange={(event) => onChange("outlineOpenByDefault", event.currentTarget.checked)}
        />
      </SettingsRow>
      <SettingsRow label={t("settings.behavior.editorSplitPercent")}>
        <div class="settings-range">
          <input
            type="range"
            min="20"
            max="80"
            step="1"
            value={preferences.editorSplitPercent}
            aria-label={t("settings.behavior.editorSplitPercent")}
            oninput={(event) => onChange("editorSplitPercent", event.currentTarget.valueAsNumber)}
          />
          <span class="range-value">{preferences.editorSplitPercent}%</span>
        </div>
      </SettingsRow>
      <SettingsRow label={t("settings.behavior.restoreTabsOnLaunch")}>
        <input
          type="checkbox"
          class="settings-checkbox"
          aria-label={t("settings.behavior.restoreTabsOnLaunch")}
          checked={preferences.restoreTabsOnLaunch}
          onchange={(event) => onChange("restoreTabsOnLaunch", event.currentTarget.checked)}
        />
      </SettingsRow>
    </section>

    <section id="settings-section-recent" class="settings-section">
      <div class="settings-section-header">
        <h2>{t("settings.recent.title")}</h2>
        {#if preferences.recentFiles.length}
          <button type="button" class="settings-link-button" onclick={clearRecentFiles}>
            {t("settings.recent.clear")}
          </button>
        {/if}
      </div>
      {#if preferences.recentFiles.length}
        <ul class="settings-recent-list">
          {#each preferences.recentFiles as file (file.path)}
            <li class="settings-recent-item">
              <div class="settings-recent-text">
                <strong>{file.name}</strong>
                <span class="settings-recent-time">
                  {formatRelativeTime(file.lastOpenedMs, locale)}
                </span>
                <span class="settings-recent-path" title={file.path}>{file.path}</span>
              </div>
              <button
                type="button"
                class="settings-link-button"
                title={t("settings.recent.remove")}
                onclick={() => removeRecentFile(file.path)}
              >
                {t("settings.recent.remove")}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="settings-empty">{t("settings.recent.empty")}</p>
      {/if}
    </section>

    <section id="settings-section-updates" class="settings-section">
      <h2>{t("settings.updates.title")}</h2>
      <SettingsRow label={t("settings.updates.checkAutomatically")}>
        <input
          type="checkbox"
          class="settings-checkbox"
          aria-label={t("settings.updates.checkAutomatically")}
          checked={preferences.updateChecksEnabled}
          onchange={(event) => onChange("updateChecksEnabled", event.currentTarget.checked)}
        />
      </SettingsRow>
      <SettingsRow label={t("settings.updates.checkNow")}>
        <button
          type="button"
          class="secondary-button"
          disabled={updateBusy}
          onclick={() => void updates.check()}
        >
          {updateActionLabel}
        </button>
      </SettingsRow>
    </section>

    <section id="settings-section-about" class="settings-section">
      <h2>{t("settings.about.title")}</h2>
      <SettingsRow label={t("settings.about.version")}>
        <span class="settings-value">{version}</span>
      </SettingsRow>
      <SettingsRow label={t("settings.about.license")}>
        <span class="settings-value">{t("settings.about.licenseValue")}</span>
      </SettingsRow>
      <SettingsRow label={t("settings.about.configPath")}>
        <span class="settings-value settings-value-mono" title={configPath}>{configPath}</span>
      </SettingsRow>
    </section>
  </div>
</div>
