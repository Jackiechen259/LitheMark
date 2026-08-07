import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { en } from "./messages/en";
import { zh } from "./messages/zh";
import {
  activeLocale,
  resolveLocale,
  setActiveLocale,
  setLocale,
  t,
  translate,
} from "./i18n.svelte";

const originalLanguage = navigator.language;

function setNavigatorLanguage(value: string) {
  Object.defineProperty(navigator, "language", { value, configurable: true });
}

describe("i18n", () => {
  beforeEach(() => {
    setActiveLocale("en");
    setNavigatorLanguage(originalLanguage);
  });

  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("returns the active locale's message", () => {
    setActiveLocale("en");
    expect(t("app.ready")).toBe("Ready");
    setActiveLocale("zh");
    expect(t("app.ready")).toBe("就绪");
  });

  it("interpolates placeholders into the message", () => {
    setActiveLocale("en");
    expect(t("tabs.close", { name: "readme.md" })).toBe("Close readme.md");
    setActiveLocale("zh");
    expect(t("tabs.close", { name: "readme.md" })).toBe("关闭 readme.md");
  });

  it("falls back to English when the active locale lacks a key", () => {
    const key = "app.ready";
    const saved = zh[key];
    // The type system forbids a real gap; simulate one a corrupt build could produce.
    delete (zh as Record<string, string>)[key];

    setActiveLocale("zh");
    expect(t(key)).toBe(en[key]);

    zh[key] = saved;
  });

  it("falls back to the key itself when no locale knows it", () => {
    expect(translate("en", "no.such.key" as never)).toBe("no.such.key");
    expect(translate("zh", "no.such.key" as never)).toBe("no.such.key");
  });

  it("resolves 'system' to English when the OS is not Chinese", () => {
    setNavigatorLanguage("en-US");
    expect(resolveLocale("system")).toBe("en");
    setNavigatorLanguage("fr-FR");
    expect(resolveLocale("system")).toBe("en");
  });

  it("resolves 'system' to Chinese when the OS language starts with zh", () => {
    setNavigatorLanguage("zh-CN");
    expect(resolveLocale("system")).toBe("zh");
    setNavigatorLanguage("zh-TW");
    expect(resolveLocale("system")).toBe("zh");
  });

  it("passes explicit preferences through unchanged", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("zh")).toBe("zh");
  });

  it("setLocale follows the system locale and updates the active locale", () => {
    setNavigatorLanguage("zh-CN");
    setLocale("system");
    expect(activeLocale()).toBe("zh");

    setNavigatorLanguage("en-US");
    setLocale("system");
    expect(activeLocale()).toBe("en");
  });
});
