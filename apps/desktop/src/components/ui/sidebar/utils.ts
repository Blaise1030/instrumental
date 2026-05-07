import type { ComputedRef, Ref } from 'vue'
import { createContext } from 'reka-ui'

export const SIDEBAR_COOKIE_NAME = 'sidebar_state'
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
export const SIDEBAR_WIDTH = '18rem'
export const SIDEBAR_WIDTH_MOBILE = '18rem'
export const SIDEBAR_WIDTH_ICON = '3rem'
export const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

export type SidebarContextValue = {
  state: ComputedRef<'expanded' | 'collapsed'>
  open: Ref<boolean>
  setOpen: (value: boolean) => void
  isMobile: Ref<boolean>
  openMobile: Ref<boolean>
  setOpenMobile: (value: boolean) => void
  toggleSidebar: () => void
}

/** Thread / workspace shell (Layout.vue). */
export const [useSidebar, provideSidebarContext] =
  createContext<SidebarContextValue>('Sidebar')

/** File explorer panel — isolated from thread sidebar context. */
export const [useFileExplorerSidebar, provideFileExplorerSidebarContext] =
  createContext<SidebarContextValue>('FileExplorerSidebar')
