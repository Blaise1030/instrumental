<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    role="status"
    aria-label="Loading"
    :class="cn('relative h-full min-h-16 p-2', props.class)"
  >
    <span
      aria-hidden="true"
      class="cursor-loading-blink pointer-events-none absolute left-2 top-2 block h-5 w-2 bg-foreground"
    />
  </div>
</template>

<style scoped>
@keyframes cursor-loading-blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.cursor-loading-blink {
  animation: cursor-loading-blink 1.05s step-end infinite;
}
</style>
