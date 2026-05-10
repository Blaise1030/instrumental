<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { CursorLoading } from "@/components/ui/cursor-loading";
import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import type { QueueItem } from "@/contextQueue/types";
import ContextQueueSelectionPopup from "@/modules/agent/components/contextQueue/ContextQueueSelectionPopup.vue";
import { useTerminalSelectionQueue } from "@/modules/contextQueue/useTerminalSelectionQueue";
import { injectContextToAgentKey } from "@/contextQueue/injectionKeys";

const props = withDefaults(
  defineProps<{
    /**
     * Opaque PTY session key (e.g. thread id, or `__shell:${worktreeId}:${slot}`).
     * Must stay stable for the lifetime of this pane instance unless you intend to reattach.
     */
    sessionId: string;
    worktreeId: string;
    cwd: string;
    /** After `ptyCreate`, send `command` + Enter once when rules below allow it. */
    pendingAgentBootstrap?: PendingAgentBootstrap | null;
    /** Accessible name for the xterm surface. */
    ariaLabel?: string;
    /** Pass true when this pane is inside AgentPane; changes the paste label to [Agent Tab]. */
    agentTab?: boolean;
  }>(),
  {
    pendingAgentBootstrap: null,
    ariaLabel: "Terminal",
    agentTab: false,
  }
);

const emit = defineEmits<{
  bootstrapConsumed: [];
  "user-typed": [sessionId: string];
  /** Raw stdin from xterm before it is sent to the PTY (e.g. for thread title hints). */
  "stdin-chunk": [sessionId: string, data: string];
}>();

const containerRef = ref<HTMLElement | null>(null);

const injectContextToAgent = inject(injectContextToAgentKey, undefined);

// agentTab is stable after mount; props.agentTab does not change at runtime
const termQueue = useTerminalSelectionQueue({
  getTerminal: () => terminal,
  agentTab: props.agentTab,
});

async function onQueueSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  let item: QueueItem;
  try {
    item = termQueue.buildItem();
  } catch {
    return;
  }
  await injectContextToAgent([item]);
  termQueue.dismiss();
}
const ptyBusy = ref(false);
const activeSessionId = ref("");
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let ptyDataDisposer: (() => void) | null = null;
let attachGeneration = 0;
/** `ptyCreate` returned an existing session (`created: false`); skip `mode: "resume"` autostart. */
let attachedWithLivePty = false;
let didCompleteInitialAttach = false;
let dropHandlersCleanup: (() => void) | null = null;

function shellQuotePathForPty(absPath: string): string {
  if (absPath === "") return "''";
  if (!/[\s#'"`$&|;<>*?()[\]{}~!\\]/.test(absPath)) {
    return absPath;
  }
  return `'${absPath.replace(/'/g, `'\\''`)}'`;
}

function pathsFromFileDrop(dt: DataTransfer): string[] {
  const api = getApi();
  const getPath = api?.getPathForFile;
  if (!getPath || dt.files.length === 0) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const file = dt.files.item(i);
    if (!file) continue;
    try {
      out.push(getPath(file));
    } catch {
      // Invalid / non-local file in some environments
    }
  }
  return out;
}

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

function terminalMonoFontStack(): string {
  if (typeof document === "undefined") {
    return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  }
  const stack = getComputedStyle(document.documentElement).getPropertyValue("--font-app-mono").trim();
  return stack || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
}

function applyTheme(): void {
  if (!terminal || !containerRef.value) return;
  const cs = getComputedStyle(containerRef.value);
  const bg = cs.backgroundColor || "#ffffff";
  const fg = cs.color || "#0a0a0a";
  terminal.options.theme = { background: bg, foreground: fg, cursor: fg };
}

function fit(): void {
  if (!terminal || !fitAddon || !containerRef.value) return;
  const { clientWidth, clientHeight } = containerRef.value;
  if (clientWidth < 2 || clientHeight < 2) return;
  fitAddon.fit();
}

async function restoreDisplayFromBuffer(): Promise<void> {
  const api = getApi();
  const sid = activeSessionId.value;
  if (!api?.ptyGetBuffer || !terminal || !sid) return;
  const gen = attachGeneration;
  try {
    const { buffer } = await api.ptyGetBuffer(sid);
    if (gen !== attachGeneration) return;
    terminal.reset();
    if (buffer) {
      terminal.write(buffer);
    }
    fit();
  } catch {
    /* IPC unavailable */
  }
}

async function tryInjectPendingBootstrap(sessionId: string, gen: number): Promise<void> {
  const api = getApi();
  if (!api || !terminal) return;
  const boot = props.pendingAgentBootstrap;
  if (!boot?.command.trim() || boot.threadId !== props.sessionId) return;
  if (gen !== attachGeneration) return;
  void api.ptyWrite(sessionId, `${boot.command}\r`);
  emit("bootstrapConsumed");
}

async function attachPty(): Promise<void> {
  const gen = ++attachGeneration;
  const sessionId = props.sessionId;
  ptyBusy.value = true;
  try {
    const api = getApi();
    if (!api || !terminal) return;

    ptyDataDisposer?.();
    ptyDataDisposer = null;

    terminal.reset();

    attachedWithLivePty = false;
    const { buffer, created = true } = await api.ptyCreate(sessionId, props.cwd, props.worktreeId);
    if (gen !== attachGeneration) return;

    activeSessionId.value = sessionId;
    attachedWithLivePty = !created;

    if (buffer) {
      terminal.write(buffer);
    }

    ptyDataDisposer = api.onPtyData((id, data) => {
      if (gen !== attachGeneration || id !== sessionId) return;
      terminal?.write(data);
    });

    const bootMode = props.pendingAgentBootstrap?.mode ?? "prompt";
    if (created || bootMode === "prompt") {
      await tryInjectPendingBootstrap(sessionId, gen);
    }
  } finally {
    if (gen === attachGeneration) {
      ptyBusy.value = false;
    }
  }
}

onMounted(async () => {
  const el = containerRef.value;
  if (!el) return;

  terminal = new Terminal({
    fontFamily: terminalMonoFontStack(),
    fontSize: 12,
    lineHeight: 1.35,
    cursorBlink: true,
    cursorStyle: "block",
    convertEol: false,
    disableStdin: false,
    bellStyle: "none"
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(el);

  terminal.attachCustomKeyEventHandler((domEvent) => {
    if (domEvent.type !== "keydown") return true;
    const mod = domEvent.ctrlKey || domEvent.metaKey;
    if (mod && domEvent.shiftKey && domEvent.key.toLowerCase() === "r") {
      domEvent.preventDefault();
      void restoreDisplayFromBuffer();
      return false;
    }
    return true;
  });
  applyTheme();
  fit();
  void document.fonts.ready.then(() => fit());

  const api = getApi();
  if (api) {
    terminal.onData((data) => {
      const sid = activeSessionId.value;
      if (sid) {
        emit("user-typed", sid);
        emit("stdin-chunk", sid, data);
        void api.ptyWrite(sid, data);
      }
    });
    terminal.onResize(({ cols, rows }) => {
      const sid = activeSessionId.value;
      if (sid) {
        emit("user-typed", sid);
        void api.ptyResize(sid, cols, rows);
      }
    });
  }

  resizeObserver = new ResizeObserver(() => {
    fit();
    applyTheme();
  });
  resizeObserver.observe(el);

  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  await attachPty();
  didCompleteInitialAttach = true;

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const paths = pathsFromFileDrop(e.dataTransfer);
    if (paths.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sid = activeSessionId.value;
    const api = getApi();
    if (!sid || !api) return;
    const payload = paths.map(shellQuotePathForPty).join(" ");
    emit("user-typed", sid);
    void api.ptyWrite(sid, payload);
    terminal?.focus();
  };

  el.addEventListener("dragover", onDragOver);
  el.addEventListener("drop", onDrop);
  dropHandlersCleanup = () => {
    el.removeEventListener("dragover", onDragOver);
    el.removeEventListener("drop", onDrop);
    dropHandlersCleanup = null;
  };
});

onBeforeUnmount(() => {
  dropHandlersCleanup?.();
  resizeObserver?.disconnect();
  resizeObserver = null;
  themeObserver?.disconnect();
  themeObserver = null;
  ptyDataDisposer?.();
  ptyDataDisposer = null;
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});

watch(
  () => [props.sessionId, props.worktreeId, props.cwd] as const,
  async () => {
    await attachPty();
    if (didCompleteInitialAttach) {
      fit();
      terminal?.focus();
    }
  }
);

watch(
  () => props.pendingAgentBootstrap,
  () => {
    const boot = props.pendingAgentBootstrap;
    if (!boot?.command.trim()) return;
    if (boot.threadId !== props.sessionId) return;
    if (activeSessionId.value !== props.sessionId) return;
    const mode = boot.mode ?? "prompt";
    if (attachedWithLivePty && mode === "resume") return;
    void tryInjectPendingBootstrap(props.sessionId, attachGeneration);
  },
  { deep: true, flush: "post" }
);

function focusTerminal(): void {
  terminal?.focus();
}

function runResizePass(): void {
  fit();
  applyTheme();
}

function refreshTerminal(): void {
  requestAnimationFrame(() => {
    runResizePass();
    requestAnimationFrame(() => {
      runResizePass();
    });
  });
}

/** Send raw text to the PTY as stdin, then Enter — same pattern as agent bootstrap injection. */
function injectPrompt(text: string): void {
  if (text.length === 0) return;
  const api = getApi();
  const sid = activeSessionId.value;
  if (!api || !sid) return;
  emit("user-typed", sid);
  void api.ptyWrite(sid, text);
  void api.ptyWrite(sid, "\r");
  terminal?.focus();
}

/** Run each non-empty line as if the user typed it and pressed Enter (quick scripts / snippets). */
function injectScript(text: string): void {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);
  if (lines.length === 0) return;
  const api = getApi();
  const sid = activeSessionId.value;
  if (!api || !sid) return;
  emit("user-typed", sid);
  for (const line of lines) {
    void api.ptyWrite(sid, line);
    void api.ptyWrite(sid, "\r");
  }
  terminal?.focus();
}

defineExpose({
  focus: focusTerminal,
  refresh: refreshTerminal,
  injectPrompt,
  injectScript
});
</script>

<template>
  <section
    data-instrument-terminal
    class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background px-3 pt-1 pb-0 text-xs text-card-foreground"
    role="document"
    :aria-label="ariaLabel"
    @mouseup="termQueue.onMouseUp"
  >
    <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <div ref="containerRef" class="terminal-pane h-full min-h-0 w-full overflow-hidden" />
    </div>
    <div
      v-show="ptyBusy"
      class="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background"
      aria-live="polite"
      aria-busy="true"
    >
      <CursorLoading class="h-full min-h-0 w-full" />
    </div>
    <ContextQueueSelectionPopup
      :visible="termQueue.visible.value"
      :anchor="termQueue.anchor.value"
      @send-to-agent="onQueueSendToAgent"
      @dismiss="termQueue.dismiss"
    />
  </section>
</template>

<style scoped>
.terminal-pane :deep(.xterm) {
  height: 100%;
  width: 100%;
  padding: 0;
}

.terminal-pane :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
