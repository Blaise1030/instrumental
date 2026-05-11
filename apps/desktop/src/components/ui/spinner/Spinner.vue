<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Loader2 } from 'lucide-vue-next'
import { cn } from '@/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Loader2 :class="cn('animate-spin size-4 shrink-0', props.class)" />
</template>
