import { defineStore } from "pinia";
import type { VocabLevel } from "@/constants/vocab";

const STORAGE_KEY = "instrument.vocabLevel";

function loadLevel(): VocabLevel {
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return 3;
}

export const useVocabStore = defineStore("vocab", {
  state: () => ({ level: loadLevel() }),
  actions: {
    setLevel(level: VocabLevel) {
      this.level = level;
      localStorage.setItem(STORAGE_KEY, String(level));
    },
  },
});
