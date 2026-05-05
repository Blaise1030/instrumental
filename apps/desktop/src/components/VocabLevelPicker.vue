<script setup lang="ts">
import { VOCAB_LEVEL_LABELS, type VocabLevel } from "@/constants/vocab";
import { useVocab } from "@/composables/useVocab";

const { level, setLevel } = useVocab();

const levels: { value: VocabLevel; label: string; hint: string }[] = [
  { value: 1, label: VOCAB_LEVEL_LABELS[1], hint: "Everyday language — no git terms." },
  { value: 2, label: VOCAB_LEVEL_LABELS[2], hint: "Familiar terms like Commit and Branch." },
  { value: 3, label: VOCAB_LEVEL_LABELS[3], hint: "Standard git terminology." },
];
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-medium text-foreground">Terminology level</p>
    <p class="text-xs text-muted-foreground">
      Choose how git concepts are labelled throughout the app.
    </p>
    <div class="mt-1 flex gap-2" role="group" aria-label="Terminology level">
      <button
        v-for="opt in levels"
        :key="opt.value"
        type="button"
        :aria-pressed="level === opt.value"
        :title="opt.hint"
        :class="[
          'rounded-md border px-3 py-1.5 text-sm transition-colors',
          level === opt.value
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:bg-muted',
        ]"
        @click="setLevel(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
    <p class="text-[11px] text-muted-foreground">
      {{ levels.find((l) => l.value === level)?.hint }}
    </p>
  </div>
</template>
