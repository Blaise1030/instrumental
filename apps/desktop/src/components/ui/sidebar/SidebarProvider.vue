<script setup lang="ts">
import type { HTMLAttributes, Ref } from 'vue'
import { defaultDocument, useEventListener, useMediaQuery, useVModel } from '@vueuse/core'
import { TooltipProvider } from 'reka-ui'
import { computed, ref } from 'vue'
import { cn } from '@/utils/cn'
import { provideSidebarContext, provideFileExplorerSidebarContext, SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME, SIDEBAR_KEYBOARD_SHORTCUT, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from './utils'

const props = withDefaults(defineProps<{
  defaultOpen?: boolean
  open?: boolean
  class?: HTMLAttributes['class']
  /** Thread shell vs file explorer — separate inject context from Layout's sidebar. */
  sidebarScope?: 'thread' | 'fileExplorer'
  /** When false, open state is not written to the global sidebar cookie (nested providers). */
  persistCookie?: boolean
  /** When false, Cmd/Ctrl+B does not toggle this sidebar (nested providers). */
  keyboardShortcut?: boolean
}>(), {
  defaultOpen: undefined,
  open: undefined,
  sidebarScope: 'thread',
  persistCookie: true,
  keyboardShortcut: true,
})

const emits = defineEmits<{
  'update:open': [open: boolean]
}>()

function initialDefaultOpen(): boolean {
  if (props.defaultOpen !== undefined) return props.defaultOpen
  if (props.sidebarScope === 'fileExplorer') return true
  try {
    return !defaultDocument?.cookie.includes(`${SIDEBAR_COOKIE_NAME}=false`)
  } catch {
    return true
  }
}

const isMobile = useMediaQuery('(max-width: 768px)')
const openMobile = ref(false)

const open = useVModel(props, 'open', emits, {
  defaultValue: initialDefaultOpen(),
  passive: (props.open === undefined) as false,
}) as Ref<boolean>

function setOpen(value: boolean) {
  open.value = value // emits('update:open', value)

  if (props.persistCookie) {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${open.value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }
}

function setOpenMobile(value: boolean) {
  openMobile.value = value
}

// Helper to toggle the sidebar.
function toggleSidebar() {
  return isMobile.value ? setOpenMobile(!openMobile.value) : setOpen(!open.value)
}

useEventListener('keydown', (event: KeyboardEvent) => {
  if (!props.keyboardShortcut) return
  if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    toggleSidebar()
  }
})

// We add a state so that we can do data-state="expanded" or "collapsed".
// This makes it easier to style the sidebar with Tailwind classes.
const state = computed(() => open.value ? 'expanded' : 'collapsed')

const sidebarContext = {
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
}

if (props.sidebarScope === 'fileExplorer') {
  provideFileExplorerSidebarContext(sidebarContext)
} else {
  provideSidebarContext(sidebarContext)
}
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      data-slot="sidebar-wrapper"
      :style="{
        '--sidebar-width': SIDEBAR_WIDTH,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
      }"
      :class="cn('group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full min-w-0', props.class)"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </TooltipProvider>
</template>
