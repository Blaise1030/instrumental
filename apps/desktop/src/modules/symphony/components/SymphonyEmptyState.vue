<script setup lang="ts">
const emit = defineEmits<{
  "view-template": [];
  "open-editor": [];
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
    <span class="text-3xl">⚡</span>
    <h2 class="text-lg font-semibold">Symphony not configured</h2>
    <p class="text-sm text-muted-foreground max-w-xs">
      Add a <code class="font-mono text-xs bg-muted px-1 rounded">WORKFLOW.md</code>
      to your repo root to define your kanban columns and connect your issue tracker.
    </p>
    <div class="flex gap-2 mt-2">
      <button
        class="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        @click="emit('view-template')"
      >
        View template
      </button>
      <button
        class="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        @click="emit('open-editor')"
      >
        Open in editor
      </button>
    </div>
  </div>
</template>
