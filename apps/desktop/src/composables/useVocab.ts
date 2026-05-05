import { computed } from "vue";
import { VOCAB, type VocabKey, type VocabLevel } from "@/constants/vocab";
import { useVocabStore } from "@/stores/vocabStore";

export function useVocab() {
  const store = useVocabStore();
  const level = computed(() => store.level);
  const t = (key: VocabKey): string => VOCAB[store.level][key];
  const setLevel = (l: VocabLevel) => store.setLevel(l);
  return { t, level, setLevel };
}
