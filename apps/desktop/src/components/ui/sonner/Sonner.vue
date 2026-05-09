<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'
import { computed } from 'vue'

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-vue-next'
import { CursorLoading } from '@/components/ui/cursor-loading'
import { useColorScheme } from '@/hooks/useColorScheme'
import { Toaster as Sonner } from 'vue-sonner'
import { cn } from '@/utils/cn'

const props = defineProps<ToasterProps>()

const { resolvedIsDark } = useColorScheme()
/** Sonner only lightens `[data-description]` when `data-sonner-theme` is dark — match `html.dark`. */
const theme = computed(() => props.theme ?? (resolvedIsDark.value ? 'dark' : 'light'))
</script>

<template>
  <Sonner
    :class="cn('toaster group', props.class)"
    :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius)',
    }"
    :toast-options="{
      classes: {
        toast: 'rounded-md',
      },
    }"
    v-bind="props"
    :theme="theme"
  >
    <template #success-icon>
      <CircleCheckIcon class="size-4" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-4" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-4" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-4" />
    </template>
    <template #loading-icon>
      <CursorLoading class="inline-block size-4 min-h-0 shrink-0 overflow-hidden" />
    </template>
    <template #close-icon>
      <XIcon class="size-4" />
    </template>
  </Sonner>
</template>
