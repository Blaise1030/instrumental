---
name: instrument-module-architecture
description: Use when adding a new module, creating a new component, wiring up data fetching, adding IPC handlers, or deciding where a new file belongs in the instrument desktop app. Use when unsure whether something should live inside a module or be promoted to a shared level.
---

# Instrument Module Architecture

## Overview

All feature code is grouped into **modules**. Each module owns its internals. Reusable cross-module code is promoted upward. Services are injected via `AppContext`. Data is loaded with Tanstack Query. IPC keys are module-local, aggregated centrally.

## Module Directory Structure

```
src/modules/<module-name>/
  components/     # UI components used only within this module
  pages/          # Route-level page components
  layouts/        # Layout wrappers for the module
  utils/          # Pure helpers scoped to this module
  hooks/          # Vue composables scoped to this module
  stores/         # Pinia stores scoped to this module
  <module>Route.ts         # Route definitions for this module
  <module>IpcKeys.ts       # IPC event names/channels for this module
  <module>ShellContext.ts  # Module-level shell/IPC bridge if needed
```

## Promotion Rule — Cross-Module Reuse

When a component, hook, store, layout, or utility is needed by **2+ modules**, promote it:

| Type | Promoted to |
|------|-------------|
| Component | `src/components/` |
| Page | `src/pages/` |
| Layout | `src/layouts/` |
| Hook / Composable | `src/hooks/` |
| Pinia store | `src/stores/` |
| Utility | `src/utils/` |

Never copy-paste between modules. If you catch yourself duplicating, promote instead.

## Auto-Healing Convention

When you promote a cross-module item to a shared directory, **add it to this skill document** under the "Shared Inventory" section below so future work reuses it rather than recreates it.

Red flag: if you are about to create a new shared item that sounds like something that might already exist — search this document first.

## Shared Inventory

*(Update this section whenever a cross-module item is promoted)*

| Item | Type | Location | Purpose |
|------|------|----------|---------|
| — | — | — | — |

## AppContext — Service Injection

All module-level services (file system access, Git operations, shell commands, settings, etc.) **must be injected via `AppContext`**, not imported directly.

```ts
// ✅ Correct — injected via AppContext
const { fileService, gitService } = useAppContext()

// ❌ Wrong — direct import couples module to implementation
import { fileService } from '@/services/fileService'
```

`AppContext` is the adapter/hinge point between the desktop (Electron) and any future target (web, mobile). Keeping services behind it ensures cross-device extensibility without rewriting module logic.

## Data Loading — Tanstack Query

Use `useQuery` for reads. Use `useMutation` + `queryClient.invalidateQueries` for writes.

```ts
// Read
const { data: files } = useQuery({
  queryKey: ['explorer', 'files', folderId],
  queryFn: () => appContext.fileService.listFiles(folderId),
})

// Write — invalidate to refresh UI
const { mutate } = useMutation({
  mutationFn: (path: string) => appContext.fileService.deleteFile(path),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['explorer', 'files'] })
  },
})
```

Query keys follow `[module, resource, ...params]` convention. Invalidate at the module level (`['explorer']`) to refresh all related queries, or narrow to a specific resource.

## IPC — Module Keys, Central Registry

Each module defines its own IPC keys in `<module>IpcKeys.ts`:

```ts
// src/modules/explorer/explorerIpcKeys.ts
export const EXPLORER_IPC = {
  LIST_FILES: 'explorer:list-files',
  DELETE_FILE: 'explorer:delete-file',
} as const
```

The main IPC file imports and re-exports all module keys:

```ts
// src/ipc/index.ts
export { EXPLORER_IPC } from '@/modules/explorer/explorerIpcKeys'
export { GIT_IPC } from '@/modules/git/gitIpcKeys'
// ...
```

Consumers import from `@/ipc`:

```ts
import { EXPLORER_IPC } from '@/ipc'
```

Never scatter IPC strings inline — always reference named constants from the module key file.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Importing a service directly into a module | Inject via `AppContext` |
| Duplicating a component across two modules | Promote to `src/components/` |
| Using `fetch` / raw IPC strings inline | Use Tanstack Query + named IPC keys |
| Defining IPC handlers in the main IPC file | Define in module, export to main |
| Forgetting to invalidate after mutation | Always call `invalidateQueries` in `onSuccess` |
| Promoting without updating Shared Inventory | Update this skill document |
