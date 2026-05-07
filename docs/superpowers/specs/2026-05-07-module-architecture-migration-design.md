# Module Architecture Migration Design

**Date:** 2026-05-07  
**Scope:** Full codebase refactor to enforce the `instrument-module-architecture` skill conventions  
**Strategy:** Single spec, module-by-module execution (git → agent → explorer → browser → welcome)

---

## Goals

1. Every module is self-contained: components, stores, services, hooks, IPC keys, and routes live inside `src/modules/<module>/`
2. Cross-module reusable items are promoted to top-level `src/components/`, `src/stores/`, etc.
3. All services are injected via `AppContext` — no direct service imports in components
4. Data fetching uses Tanstack Query (`useQuery` / `useMutation`) — no raw IPC calls in components
5. IPC channels are named constants in module-scoped `<module>IpcKeys.ts` files, aggregated at `src/ipc/index.ts`
6. Router is a thin aggregator of per-module route definitions

---

## Target Directory Shape

### Per-module structure
```
src/modules/<module>/
  components/
    __tests__/
    *.vue
  stores/
    __tests__/
    <module>Store.ts
  services/
    <module>Service.ts
    ipc<Module>Service.ts
  hooks/
    use*.ts
  pages/
    *.vue
  <module>IpcKeys.ts
  <module>Route.ts
```

### Global (stays at src/)
```
src/
  app-context/
    AppContext.vue
    type.ts          ← expanded with typed service slots per module
    useAppContext.ts
  ipc/
    index.ts         ← re-exports from all module IpcKeys files
  layouts/
    Layout.vue       ← cross-module shell, unchanged
  stores/
    workspaceStore.ts    ← cross-module, stays global
    keybindingsStore.ts  ← cross-module, stays global
  router/
    index.ts         ← thin aggregator of module routes + guards
    branchParam.ts
    workspaceRouteMemory.ts
  components/        ← only promoted cross-module components remain here
```

---

## AppContext Expansion

`src/app-context/type.ts` gets a typed slot per module service:

```ts
export interface AppContext {
  gitService: GitService
  threadManagementService: ThreadManagementService
  // add per module as migration proceeds
}
```

`src/app-context/AppContext.vue` instantiates the concrete implementations (IPC-backed on desktop) and provides them via Vue `provide`.

Components access services only via `useAppContext()` — never via direct import of service files.

---

## IPC Key Convention

Each module defines named constants:

```ts
// src/modules/git/gitIpcKeys.ts
export const GIT_IPC = {
  GET_STATUS: 'git:get-status',
  STAGE_FILE: 'git:stage-file',
  // ...
} as const
```

`src/ipc/index.ts` aggregates:

```ts
export { GIT_IPC } from '@/modules/git/gitIpcKeys'
export { AGENT_IPC } from '@/modules/agent/agentIpcKeys'
export { EXPLORER_IPC } from '@/modules/explorer/explorerIpcKeys'
export { BROWSER_IPC } from '@/modules/browser/browserIpcKeys'
```

Consumers import from `@/ipc` only. `src/shared/ipc.ts` is deleted once all channels are migrated.

---

## Tanstack Query Pattern

**QueryClient** registered once in `App.vue` via `VueQueryPlugin` (if not already present).

**Reads** — composable in module `hooks/`:
```ts
// src/modules/git/hooks/useGitStatus.ts
export function useGitStatus(worktreeId: Ref<string>) {
  const { gitService } = useAppContext()
  return useQuery({
    queryKey: ['git', 'status', worktreeId],
    queryFn: () => gitService.getStatus(worktreeId.value),
  })
}
```

**Writes** — invalidate on success:
```ts
export function useStageFile() {
  const { gitService } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => gitService.stageFile(path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['git', 'status'] }),
  })
}
```

**Query key convention:** `[module, resource, ...params]`  
Invalidate at module level (`['git']`) to refresh all, or narrow to resource (`['git', 'status']`).

**Exception:** Real-time IPC event listeners (agent streaming output, terminal data) stay as `ipcRenderer.on` subscriptions — Tanstack Query is for request/response patterns only.

---

## Router Refactor

Each module exports its route subtree:

```ts
// src/modules/git/gitRoute.ts
export const gitRoutes = {
  path: 'git',
  component: GitPage,
  children: [
    { path: '', name: 'gitPanel', component: SourceControlPanel },
    { path: 'pull-requests', name: 'gitPullRequests', component: RemotePrPanel },
    { path: 'pull-requests/:prId', name: 'gitPullRequest', component: RemotePrPanel },
  ],
}
```

`src/router/index.ts` composes them:

```ts
import { gitRoutes } from '@/modules/git/gitRoute'
import { agentRoutes } from '@/modules/agent/agentRoute'
import { explorerRoutes } from '@/modules/explorer/explorerRoute'
import { browserRoutes } from '@/modules/browser/browserRoute'

// workspace children: [agentRoutes, gitRoutes, explorerRoutes, browserRoutes]
```

`beforeEach` / `afterEach` guards and `workspaceStore` dependency remain in `router/index.ts` — these are cross-module concerns.

---

## Module Migration Checklist (per module)

For each module, in order:

- [ ] Create subdirs: `components/`, `stores/`, `services/`, `hooks/`, `pages/`
- [ ] Move module-specific components from `src/components/` → `module/components/` (with `__tests__/`)
- [ ] Move module-specific stores from `src/stores/` → `module/stores/` (with `__tests__/`)
- [ ] Move services from `src/services/<module>/` → `module/services/`
- [ ] Create `<module>IpcKeys.ts` — extract IPC strings from `src/shared/ipc.ts`
- [ ] Create `<module>Route.ts` — extract route subtree from `src/router/index.ts`
- [ ] Expand `AppContext` type with module service interface
- [ ] Wire service instantiation in `AppContext.vue`
- [ ] Replace direct IPC calls in components with Tanstack Query hooks in `module/hooks/`
- [ ] Update all imports across codebase to new paths
- [ ] Verify tests pass

---

## Module-by-Module Scope

### 1. git

**Components to move** (`src/components/` → `src/modules/git/components/`):
- `SourceControlPanel.vue` + test
- `DiffReviewPanel.vue` + test
- `BranchPicker.vue`
- `BranchSelector.vue`
- `WorktreeSwitcher.vue` + test
- `WorktreeStaleCallout.vue` + test

**Already in module** (move to `components/` subdir):
- `GitPage.vue` → `pages/GitPage.vue`
- `RemotePrPanel.vue` → `components/RemotePrPanel.vue`
- `GitHubTokenSetup.vue` → `components/GitHubTokenSetup.vue`

**Stores to move:**
- `githubPrStore.ts` → `src/modules/git/stores/`
- `scmStore.ts` → `src/modules/git/stores/`

**Services to move:**
- `src/services/git/gitService.ts` → `src/modules/git/services/`
- `src/services/git/ipcGitService.ts` → `src/modules/git/services/`

**AppContext:** Add `gitService: GitService`

---

### 2. agent

**Components to move** (`src/components/` → `src/modules/agent/components/`):
- `AgentPane.vue` + test
- `AgentCommandsSettingsDialog.vue`
- All `Thread*.vue` components + tests
- Prompt input components (`ThreadAdaptivePromptInput`, `ThreadInlinePromptEditor`, etc.)
- `contextQueue/` directory (components + tests)

**Already in module** (reorganise into subdirs):
- `AgentPage.vue` → `pages/AgentPage.vue`
- `CreateNewThread.vue` → `pages/CreateNewThread.vue`

**Stores to move:**
- `runStore.ts` → `src/modules/agent/stores/`

**Services to move:**
- `src/services/thread-management/` → `src/modules/agent/services/`

**AppContext:** Add `threadManagementService: ThreadManagementService`

---

### 3. explorer

**Components to move:**
- `FileTreeNode.vue` → `src/modules/explorer/components/`
- `FileSearchEditor.vue` test → `src/modules/explorer/components/__tests__/`

**Already in module** — reorganise into subdirs:
- `ExplorerLayout.vue` → `pages/ExplorerLayout.vue`
- `FilePage.vue` → `pages/FilePage.vue`
- `explorerShellContext.ts` → `services/`
- `explorerEditorBridge.ts` → `services/`
- `useExplorerFilePage.ts` → `hooks/`
- `fileSearchEditorPageContext.ts` → `hooks/`
- `explorerRoute.ts` already correct

**IPC:** Extract file/search IPC channels to `explorerIpcKeys.ts`

---

### 4. browser

**Components to move:**
- `PreviewPanel.vue` + test → `src/modules/browser/components/`

**Already in module:**
- `BrowserPage.vue` → `pages/BrowserPage.vue`

**IPC:** Extract browser/preview IPC channels to `browserIpcKeys.ts`

---

### 5. welcome

- `WelcomePage.vue` is already self-contained
- Extract any IPC channels to `welcomeIpcKeys.ts`
- Create `welcomeRoute.ts`

---

## Shared Inventory (cross-module promoted items)

Items confirmed to stay at `src/` level — do not move these into modules:

| Item | Location | Reason |
|------|----------|--------|
| `Layout.vue` | `src/layouts/` | Cross-module shell |
| `workspaceStore` | `src/stores/` | Used by router + all modules |
| `keybindingsStore` | `src/stores/` | App-wide keybindings |
| `Sidebar*` components | `src/components/ui/sidebar/` | UI primitives, cross-module |

---

## What Does Not Change

- `src/shared/` domain types, diff utilities, and non-IPC helpers — these are not module-specific
- `src/lib/` utilities
- `src/styles/`
- Electron main process (`apps/desktop/electron/`) — out of scope
- Test infrastructure (`vitest.config`, `test-utils/`) — out of scope beyond moving test files
