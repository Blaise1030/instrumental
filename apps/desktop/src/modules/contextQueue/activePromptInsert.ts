import { ref } from "vue"

const _insertFn = ref<((text: string) => void) | null>(null)

export function registerPromptInsert(fn: (text: string) => void): void {
  _insertFn.value = fn
}

export function unregisterPromptInsert(): void {
  _insertFn.value = null
}

export function getPromptInsertFn(): ((text: string) => void) | null {
  return _insertFn.value
}
