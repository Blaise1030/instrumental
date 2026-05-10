<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const previewFull = ref("");
let rafId = 0;
let pendingX = 0;
let pendingY = 0;

function clearPreview(): void {
  previewFull.value = "";
}

function anchorUnderPointer(el: Element | null): HTMLAnchorElement | null {
  const anchor = el?.closest?.("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function resolveHrefFull(anchor: HTMLAnchorElement): string {
  const raw = anchor.getAttribute("href");
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith("javascript:")) return "";
  if (trimmed === "#") return "";
  try {
    return new URL(anchor.href, window.location.href).href;
  } catch {
    return trimmed;
  }
}

function flushHitTarget(): void {
  rafId = 0;
  const el = document.elementFromPoint(pendingX, pendingY);
  const anchor = anchorUnderPointer(el);
  previewFull.value = anchor ? resolveHrefFull(anchor) : "";
}

function onPointerMove(ev: PointerEvent): void {
  pendingX = ev.clientX;
  pendingY = ev.clientY;
  if (rafId !== 0) return;
  rafId = window.requestAnimationFrame(flushHitTarget);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") clearPreview();
}

onMounted(() => {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("blur", clearPreview);
  document.addEventListener("visibilitychange", onVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("blur", clearPreview);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (rafId !== 0) window.cancelAnimationFrame(rafId);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-show="previewFull"
      role="status"
      aria-live="polite"
      class="pointer-events-none fixed z-[35] max-w-[calc(100vw-2rem)] whitespace-normal break-all rounded-md border border-border/80 bg-popover/95 px-2.5 py-1.5 font-mono text-[11px] leading-snug text-popover-foreground shadow-md backdrop-blur-md select-none bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-[max(0.75rem,env(safe-area-inset-left,0px))]"
      :aria-label="previewFull ? `Link target: ${previewFull}` : undefined"
      data-testid="link-hover-status"
    >
      {{ previewFull }}
    </div>
  </Teleport>
</template>
