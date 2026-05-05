import { createI18n } from "vue-i18n";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";

export type SupportedLocale = "en" | "es" | "fr";

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

const STORAGE_KEY = "instrument.locale";

export function loadLocale(): SupportedLocale {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "en" || raw === "es" || raw === "fr") return raw;
  const browser = navigator.language.slice(0, 2);
  if (browser === "es" || browser === "fr") return browser as SupportedLocale;
  return "en";
}

export function saveLocale(locale: SupportedLocale): void {
  localStorage.setItem(STORAGE_KEY, locale);
}

export const i18n = createI18n({
  legacy: false,
  locale: loadLocale(),
  fallbackLocale: "en",
  messages: { en, es, fr },
});
