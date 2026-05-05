import { defineStore } from "pinia";
import { i18n, LOCALE_LABELS, loadLocale, saveLocale, type SupportedLocale } from "@/locales/index";

export { LOCALE_LABELS };
export type { SupportedLocale };

export const useLocaleStore = defineStore("locale", {
  state: () => ({
    locale: loadLocale() as SupportedLocale,
  }),
  actions: {
    setLocale(locale: SupportedLocale) {
      this.locale = locale;
      (i18n.global.locale as { value: SupportedLocale }).value = locale;
      saveLocale(locale);
    },
  },
});
