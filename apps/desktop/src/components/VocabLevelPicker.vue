<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { VocabLevel } from "@/constants/vocab";
import { useVocab } from "@/composables/useVocab";

const { t } = useI18n();
const { level, setLevel } = useVocab();

const levels: VocabLevel[] = [1, 2, 3];
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-medium text-foreground">{{ t('ui.settings.display.vocab_level') }}</p>
    <p class="text-xs text-muted-foreground">{{ t('ui.settings.display.vocab_level_hint') }}</p>
    <div class="mt-1 flex gap-2" role="group" :aria-label="t('ui.settings.display.vocab_level')">
      <button
        v-for="lv in levels"
        :key="lv"
        type="button"
        :aria-pressed="level === lv"
        :title="t(`ui.settings.vocab_level_hints.${lv}`)"
        :class="[
          'rounded-md border px-3 py-1.5 text-sm transition-colors',
          level === lv
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:bg-muted',
        ]"
        @click="setLevel(lv)"
      >
        {{ t(`ui.settings.vocab_levels.${lv}`) }}
      </button>
    </div>
    <p class="text-[11px] text-muted-foreground">
      {{ t(`ui.settings.vocab_level_hints.${level}`) }}
    </p>
  </div>
</template>
