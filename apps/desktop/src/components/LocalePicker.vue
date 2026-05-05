<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { LOCALE_LABELS, useLocaleStore, type SupportedLocale } from "@/stores/localeStore";

const { t } = useI18n();
const store = useLocaleStore();

const locales = Object.entries(LOCALE_LABELS) as [SupportedLocale, string][];
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-medium text-foreground">{{ t('ui.settings.display.locale') }}</p>
    <p class="text-xs text-muted-foreground">{{ t('ui.settings.display.locale_hint') }}</p>
    <div class="mt-1 flex flex-wrap gap-2" role="group" :aria-label="t('ui.settings.display.locale')">
      <button
        v-for="[code, label] in locales"
        :key="code"
        type="button"
        :aria-pressed="store.locale === code"
        :class="[
          'rounded-md border px-3 py-1.5 text-sm transition-colors',
          store.locale === code
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:bg-muted',
        ]"
        @click="store.setLocale(code)"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>
