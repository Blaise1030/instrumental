<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <caption
    data-slot="table-caption"
    :class="cn('text-muted-foreground mt-4 text-xs', props.class)"
  >
    <slot />
  </caption>
</template>
