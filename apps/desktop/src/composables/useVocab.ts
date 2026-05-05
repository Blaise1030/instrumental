import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { VocabKey, VocabLevel } from "@/constants/vocab";
import { useVocabStore } from "@/stores/vocabStore";

export function useVocab() {
  const { t: i18nT } = useI18n();
  const store = useVocabStore();
  const level = computed(() => store.level);

  const t = (key: VocabKey): string =>
    i18nT(`vocab.${store.level}.${key}`);

  const setLevel = (l: VocabLevel) => store.setLevel(l);

  return { t, level, setLevel };
}
