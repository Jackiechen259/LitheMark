/**
 * LitheMark's internationalization seam.
 *
 * A single module-level `$state` locale drives every `t()` call: reading it inside a
 * template makes Svelte 5 re-render the whole interface when the language changes. There is
 * no context provider because the rest of the codebase keeps state in module singletons.
 */
import { en, type MessageKey } from "./messages/en";
import { zh } from "./messages/zh";

export type Locale = "en" | "zh";
export type LocalePreference = "system" | Locale;

const messages: Record<Locale, Record<MessageKey, string>> = { en, zh };

let locale = $state<Locale>("en");

/** The locale currently driving `t()`. Read this for non-message APIs like `Intl`. */
export function activeLocale(): Locale {
  return locale;
}

/** Resolve a stored preference into a concrete locale, following the OS for "system". */
export function resolveLocale(preference: LocalePreference): Locale {
  if (preference !== "system") return preference;
  const language =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
  return language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** Apply a stored preference, re-resolving "system" against the current environment. */
export function setLocale(preference: LocalePreference): void {
  locale = resolveLocale(preference);
}

/** Override the active locale directly. Intended for tests and the i18n module itself. */
export function setActiveLocale(next: Locale): void {
  locale = next;
}

/**
 * Translate a message key for the active locale, falling back to English when the active
 * locale is missing a key, then to the key itself. `{name}` placeholders are replaced from
 * `params`.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(locale, key, params);
}

/** Pure translation entry point used by `t()` and exposed for testing. */
export function translate(
  active: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let message = messages[active][key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
  }
  return message;
}
