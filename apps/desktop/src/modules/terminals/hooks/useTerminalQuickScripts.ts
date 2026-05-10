import { onMounted, ref, watch } from "vue";

export type TerminalQuickScript = {
  id: string;
  name: string;
  /** One or more shell lines; each line is sent to the PTY followed by Enter. */
  command: string;
};

const STORAGE_KEY = "instrument.terminalQuickScripts";

function readScripts(): TerminalQuickScript[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: TerminalQuickScript[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : crypto.randomUUID();
      const name = typeof r.name === "string" ? r.name : "";
      const command = typeof r.command === "string" ? r.command : "";
      if (!name.trim() && !command.trim()) continue;
      out.push({ id, name: name.trim() || "Untitled", command });
    }
    return out;
  } catch {
    return [];
  }
}

function writeScripts(scripts: TerminalQuickScript[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
  } catch {
    /* quota / private mode */
  }
}

/** User-defined commands for the integrated terminal (persisted in localStorage). */
export function useTerminalQuickScripts() {
  const scripts = ref<TerminalQuickScript[]>(readScripts());

  onMounted(() => {
    scripts.value = readScripts();
  });

  watch(
    scripts,
    (next) => {
      writeScripts(next);
    },
    { deep: true }
  );

  function setScripts(next: TerminalQuickScript[]): void {
    scripts.value = next;
  }

  return { scripts, setScripts };
}
