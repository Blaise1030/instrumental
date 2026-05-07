<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { CursorLoading } from '@/components/ui/cursor-loading'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <CursorLoading :class="cn('inline-block size-4 min-h-0 shrink-0 overflow-hidden', props.class)" />
</template>
