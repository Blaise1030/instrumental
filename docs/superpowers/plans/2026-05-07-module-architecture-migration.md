# Module Architecture Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `apps/desktop/src` so every module is self-contained with its own components, stores, services, hooks, and route definition; data fetching uses Tanstack Query; the router is a thin aggregator.

**Architecture:** Module-by-module migration (git → agent → explorer → browser → welcome). Each module reaches full compliance before the next starts. AppContext already has the right interface — only import paths change as services move. Services use `window.workspaceApi` bridge (no raw IPC channel strings in renderer), so no `IpcKeys.ts` files are needed.

**Tech Stack:** Vue 3, TypeScript, Pinia, Tanstack Query (`@tanstack/vue-query`), Vitest, `@vue/test-utils`

> **Note on IpcKeys:** The spec mentions per-module `<module>IpcKeys.ts` files and `src/ipc/index.ts`. This plan intentionally omits them. The renderer never calls `ipcRenderer.invoke` with raw channel strings — it goes through `window.workspaceApi` (Electron contextBridge). The service files moving into modules already encapsulates IPC per module. No `IpcKeys.ts` files are needed.

**Run these commands from:** `apps/desktop/`

---

## File Map

### Created
- `src/modules/git/components/` — git-scoped components
- `src/modules/git/stores/` — githubPrStore, scmStore
- `src/modules/git/services/` — gitService, ipcGitService
- `src/modules/git/hooks/` — Tanstack Query composables
- `src/modules/git/gitRoute.ts` — git route subtree
- `src/modules/agent/components/` — agent-scoped components
- `src/modules/agent/stores/` — runStore
- `src/modules/agent/services/` — threadManagementService, ipcThreadManagementService
- `src/modules/agent/hooks/` — Tanstack Query composables
- `src/modules/agent/agentRoute.ts` — agent route subtree
- `src/modules/explorer/components/` — FileTreeNode
- `src/modules/explorer/hooks/` — existing composables reorganised
- `src/modules/explorer/services/` — explorerShellContext, explorerEditorBridge
- `src/modules/explorer/pages/` — ExplorerLayout, FilePage
- `src/modules/explorer/explorerRoute.ts` — already exists, keep
- `src/modules/browser/components/` — PreviewPanel
- `src/modules/browser/browserRoute.ts`
- `src/modules/welcome/welcomeRoute.ts`

### Modified
- `src/app-context/AppContext.vue` — update service import paths after moves
- `src/app-context/type.ts` — update service type import paths after moves
- `src/router/index.ts` — slim to aggregator of module routes
- Any file importing a moved component/store/service — update import path

### Deleted
- `src/services/git/` — after move to `src/modules/git/services/`
- `src/services/thread-management/` — after move to `src/modules/agent/services/`

---

## Task 0: Verify VueQueryPlugin and scaffold all module subdirs

**Files:**
- Modify: `src/main.ts` or `src/App.vue` (if VueQueryPlugin not registered)

- [ ] **Step 1: Check VueQueryPlugin registration**

```bash
grep -r "VueQueryPlugin\|QueryClient" src/
```

If missing, add to `src/main.ts`:

```ts
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

const queryClient = new QueryClient()
app.use(VueQueryPlugin, { queryClient })
```

- [ ] **Step 2: Scaffold all module subdirs**

```bash
mkdir -p src/modules/git/{components/__tests__,stores/__tests__,services,hooks,pages}
mkdir -p src/modules/agent/{components/__tests__,stores/__tests__,services,hooks,pages}
mkdir -p src/modules/explorer/{components/__tests__,hooks,services,pages}
mkdir -p src/modules/browser/{components/__tests__,pages}
mkdir -p src/modules/welcome/pages
```

- [ ] **Step 3: Verify build still passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "chore: scaffold module subdirs and verify VueQueryPlugin"
```

---

## Task 1: git — move components

**Files:**
- Move: `src/components/SourceControlPanel.vue` → `src/modules/git/components/`
- Move: `src/components/__tests__/SourceControlPanel.localLlm.test.ts` → `src/modules/git/components/__tests__/`
- Move: `src/components/DiffReviewPanel.vue` → `src/modules/git/components/`
- Move: `src/components/__tests__/DiffReviewPanel.test.ts` → `src/modules/git/components/__tests__/`
- Move: `src/components/BranchPicker.vue` → `src/modules/git/components/`
- Move: `src/components/BranchSelector.vue` → `src/modules/git/components/`
- Move: `src/components/WorktreeSwitcher.vue` → `src/modules/git/components/`
- Move: `src/components/__tests__/WorktreeSwitcher.test.ts` → `src/modules/git/components/__tests__/`
- Move: `src/components/WorktreeStaleCallout.vue` → `src/modules/git/components/`
- Move: `src/components/__tests__/WorktreeStaleCallout.test.ts` → `src/modules/git/components/__tests__/`
- Also reorganise within module: `GitPage.vue` → `pages/`, `RemotePrPanel.vue` + `GitHubTokenSetup.vue` → `components/`

- [ ] **Step 1: Move files**

```bash
mv src/components/SourceControlPanel.vue src/modules/git/components/
mv src/components/__tests__/SourceControlPanel.localLlm.test.ts src/modules/git/components/__tests__/
mv src/components/DiffReviewPanel.vue src/modules/git/components/
mv src/components/__tests__/DiffReviewPanel.test.ts src/modules/git/components/__tests__/
mv src/components/BranchPicker.vue src/modules/git/components/
mv src/components/BranchSelector.vue src/modules/git/components/
mv src/components/WorktreeSwitcher.vue src/modules/git/components/
mv src/components/__tests__/WorktreeSwitcher.test.ts src/modules/git/components/__tests__/
mv src/components/WorktreeStaleCallout.vue src/modules/git/components/
mv src/components/__tests__/WorktreeStaleCallout.test.ts src/modules/git/components/__tests__/
mv src/modules/git/GitPage.vue src/modules/git/pages/
mv src/modules/git/RemotePrPanel.vue src/modules/git/components/
mv src/modules/git/GitHubTokenSetup.vue src/modules/git/components/
```

- [ ] **Step 2: Find all files importing the moved components**

```bash
grep -rl "SourceControlPanel\|DiffReviewPanel\|BranchPicker\|BranchSelector\|WorktreeSwitcher\|WorktreeStaleCallout\|GitPage\|RemotePrPanel\|GitHubTokenSetup" src/ --include="*.ts" --include="*.vue"
```

Update each found file's import to point to the new path. Example:

```ts
// Before
import SourceControlPanel from '@/components/SourceControlPanel.vue'
// After
import SourceControlPanel from '@/modules/git/components/SourceControlPanel.vue'
```

- [ ] **Step 3: Update internal imports inside moved files**

Check each moved `.vue` file for relative imports that now point to the wrong location and fix them.

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor(git): move git components into module"
```

---

## Task 2: git — move stores

**Files:**
- Move: `src/stores/githubPrStore.ts` → `src/modules/git/stores/`
- Move: `src/stores/scmStore.ts` → `src/modules/git/stores/`
- Move tests if present

- [ ] **Step 1: Move files**

```bash
mv src/stores/githubPrStore.ts src/modules/git/stores/
mv src/stores/scmStore.ts src/modules/git/stores/
```

- [ ] **Step 2: Find and update all imports**

```bash
grep -rl "githubPrStore\|scmStore" src/ --include="*.ts" --include="*.vue"
```

Update each import:

```ts
// Before
import { useGithubPrStore } from '@/stores/githubPrStore'
// After
import { useGithubPrStore } from '@/modules/git/stores/githubPrStore'
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor(git): move git stores into module"
```

---

## Task 3: git — move services and update AppContext

**Files:**
- Move: `src/services/git/gitService.ts` → `src/modules/git/services/`
- Move: `src/services/git/ipcGitService.ts` → `src/modules/git/services/`
- Modify: `src/app-context/AppContext.vue`
- Modify: `src/app-context/type.ts`

- [ ] **Step 1: Move files**

```bash
mv src/services/git/gitService.ts src/modules/git/services/
mv src/services/git/ipcGitService.ts src/modules/git/services/
rmdir src/services/git
```

- [ ] **Step 2: Update AppContext.vue import**

In `src/app-context/AppContext.vue`, change:

```ts
// Before
import { IpcGitService } from "@/services/git/ipcGitService";
// After
import { IpcGitService } from "@/modules/git/services/ipcGitService";
```

- [ ] **Step 3: Update type.ts import**

In `src/app-context/type.ts`, change:

```ts
// Before
import type { GitService } from "@/services/git/gitService";
// After
import type { GitService } from "@/modules/git/services/gitService";
```

- [ ] **Step 4: Find and update any other imports**

```bash
grep -rl "services/git" src/ --include="*.ts" --include="*.vue"
```

Update each to `@/modules/git/services/`.

- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(git): move git services into module, update AppContext paths"
```

---

## Task 4: git — extract gitRoute.ts

**Files:**
- Create: `src/modules/git/gitRoute.ts`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Create `src/modules/git/gitRoute.ts`**

```ts
import GitPage from './pages/GitPage.vue'
import SourceControlPanel from './components/SourceControlPanel.vue'
import RemotePrPanel from './components/RemotePrPanel.vue'

export const gitRoutes = {
  path: 'git',
  component: GitPage,
  children: [
    {
      path: '',
      name: 'gitPanel',
      component: SourceControlPanel,
    },
    {
      path: 'pull-requests',
      name: 'gitPullRequests',
      component: RemotePrPanel,
    },
    {
      path: 'pull-requests/:prId',
      name: 'gitPullRequest',
      component: RemotePrPanel,
    },
  ],
}
```

- [ ] **Step 2: Update `src/router/index.ts`**

Remove the git-specific imports and replace the inline git route object with `gitRoutes`:

```ts
import { gitRoutes } from '@/modules/git/gitRoute'
```

In the routes array, replace the inline git route block with `gitRoutes`.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass, routing unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor(git): extract gitRoute.ts, slim router"
```

---

## Task 5: git — add Tanstack Query hooks

**Files:**
- Create: `src/modules/git/hooks/useWorktrees.ts`
- Create: `src/modules/git/hooks/useWorktrees.test.ts`
- Create: `src/modules/git/hooks/useBranches.ts`
- Create: `src/modules/git/hooks/useBranches.test.ts`

- [ ] **Step 1: Write failing test for `useWorktrees`**

Create `src/modules/git/hooks/useWorktrees.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { useWorktrees } from './useWorktrees'

const mockGitService = {
  listWorktrees: vi.fn().mockResolvedValue([
    { path: '/repo', branch: 'main', worktreeId: 'wt-1' },
  ]),
  listBranchesExcludingWorktrees: vi.fn().mockResolvedValue(['main', 'feat/x']),
  getCurrentBranch: vi.fn().mockResolvedValue('main'),
  checkoutBranch: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/app-context/useAppContext', () => ({
  useAppContext: () => ({ gitService: mockGitService }),
}))

describe('useWorktrees', () => {
  it('returns worktrees for a given cwd', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref('/repo')
        const { data } = useWorktrees(cwd)
        return { data }
      },
      template: '<div>{{ data }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(mockGitService.listWorktrees).toHaveBeenCalledWith('/repo')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- hooks/useWorktrees
```

Expected: FAIL — `useWorktrees` not found.

- [ ] **Step 3: Implement `src/modules/git/hooks/useWorktrees.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { useAppContext } from '@/app-context/useAppContext'

export function useWorktrees(cwd: Ref<string>) {
  const { gitService } = useAppContext()
  return useQuery({
    queryKey: ['git', 'worktrees', cwd],
    queryFn: () => gitService.listWorktrees(cwd.value),
    enabled: () => !!cwd.value,
  })
}

export function useCheckoutBranch() {
  const { gitService } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ cwd, branch }: { cwd: string; branch: string }) =>
      gitService.checkoutBranch(cwd, branch),
    onSuccess: (_data, { cwd }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'worktrees'] })
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', cwd] })
    },
  })
}
```

- [ ] **Step 4: Write and implement `useBranches`**

Create `src/modules/git/hooks/useBranches.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { useAppContext } from '@/app-context/useAppContext'

export function useBranches(cwd: Ref<string>) {
  const { gitService } = useAppContext()
  return useQuery({
    queryKey: ['git', 'branches', cwd],
    queryFn: () => gitService.listBranchesExcludingWorktrees(cwd.value),
    enabled: () => !!cwd.value,
  })
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- hooks/useWorktrees
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/git/hooks/
git commit -m "feat(git): add Tanstack Query hooks for worktrees and branches"
```

---

## Task 6: agent — move components

**Files:**
- Move from `src/components/` to `src/modules/agent/components/`:
  - `AgentPane.vue` + `__tests__/AgentPane.test.ts`
  - `AgentCommandsSettingsDialog.vue`
  - `ThreadGroupHeader.vue` + `__tests__/ThreadGroupHeader.test.ts`
  - `ThreadInlinePromptEditor.vue` + `__tests__/ThreadInlinePromptEditor.test.ts`
  - `ThreadRow.vue` + `__tests__/ThreadRow.test.ts`
  - `ThreadSidebar.vue` + `__tests__/ThreadSidebar.test.ts`
  - `ThreadTopBar.vue` + `__tests__/ThreadTopBar.test.ts`
  - `TerminalPane.vue` + `__tests__/TerminalPane.test.ts`
  - `contextQueue/` directory (all files + tests)

- [ ] **Step 1: Move files**

```bash
mv src/components/AgentPane.vue src/modules/agent/components/
mv src/components/__tests__/AgentPane.test.ts src/modules/agent/components/__tests__/
mv src/components/AgentCommandsSettingsDialog.vue src/modules/agent/components/
mv src/components/ThreadGroupHeader.vue src/modules/agent/components/
mv src/components/__tests__/ThreadGroupHeader.test.ts src/modules/agent/components/__tests__/
mv src/components/ThreadInlinePromptEditor.vue src/modules/agent/components/
mv src/components/__tests__/ThreadInlinePromptEditor.test.ts src/modules/agent/components/__tests__/
mv src/components/ThreadRow.vue src/modules/agent/components/
mv src/components/__tests__/ThreadRow.test.ts src/modules/agent/components/__tests__/
mv src/components/ThreadSidebar.vue src/modules/agent/components/
mv src/components/__tests__/ThreadSidebar.test.ts src/modules/agent/components/__tests__/
mv src/components/ThreadTopBar.vue src/modules/agent/components/
mv src/components/__tests__/ThreadTopBar.test.ts src/modules/agent/components/__tests__/
mv src/components/TerminalPane.vue src/modules/agent/components/
mv src/components/__tests__/TerminalPane.test.ts src/modules/agent/components/__tests__/
mv src/components/contextQueue src/modules/agent/components/contextQueue
```

Reorganise within module:

```bash
mv src/modules/agent/AgentPage.vue src/modules/agent/pages/
mv src/modules/agent/CreateNewThread.vue src/modules/agent/pages/
```

- [ ] **Step 2: Find and update all imports**

```bash
grep -rl "AgentPane\|AgentCommandsSettings\|ThreadGroupHeader\|ThreadInlinePrompt\|ThreadRow\|ThreadSidebar\|ThreadTopBar\|TerminalPane\|contextQueue\|AgentPage\|CreateNewThread" src/ --include="*.ts" --include="*.vue"
```

Update each import to the new path under `@/modules/agent/`.

- [ ] **Step 3: Fix internal relative imports in moved files**

Check each moved file for relative imports (e.g., `../stores/`, `../lib/`) that now resolve incorrectly and update to `@/`-prefixed absolute imports.

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor(agent): move agent components into module"
```

---

## Task 7: agent — move stores

**Files:**
- Move: `src/stores/runStore.ts` → `src/modules/agent/stores/`
- Move: `src/stores/__tests__/` run store tests if present

- [ ] **Step 1: Move files**

```bash
mv src/stores/runStore.ts src/modules/agent/stores/
```

- [ ] **Step 2: Find and update all imports**

```bash
grep -rl "runStore" src/ --include="*.ts" --include="*.vue"
```

Update each:

```ts
// Before
import { useRunStore } from '@/stores/runStore'
// After
import { useRunStore } from '@/modules/agent/stores/runStore'
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor(agent): move runStore into module"
```

---

## Task 8: agent — move services and update AppContext

**Files:**
- Move: `src/services/thread-management/threadManagementService.ts` → `src/modules/agent/services/`
- Move: `src/services/thread-management/ipcThreadManagementService.ts` → `src/modules/agent/services/`
- Modify: `src/app-context/AppContext.vue`
- Modify: `src/app-context/type.ts`

- [ ] **Step 1: Move files**

```bash
mv src/services/thread-management/threadManagementService.ts src/modules/agent/services/
mv src/services/thread-management/ipcThreadManagementService.ts src/modules/agent/services/
rmdir src/services/thread-management
rmdir src/services   # only if empty
```

- [ ] **Step 2: Update AppContext.vue**

```ts
// Before
import { IpcThreadManagementService } from "@/services/thread-management/ipcThreadManagementService";
// After
import { IpcThreadManagementService } from "@/modules/agent/services/ipcThreadManagementService";
```

- [ ] **Step 3: Update type.ts**

```ts
// Before
import type { ThreadManagementService } from "@/services/thread-management/threadManagementService";
// After
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";
```

- [ ] **Step 4: Find and update any other imports**

```bash
grep -rl "services/thread-management" src/ --include="*.ts" --include="*.vue"
```

- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(agent): move agent services into module, update AppContext paths"
```

---

## Task 9: agent — extract agentRoute.ts

**Files:**
- Create: `src/modules/agent/agentRoute.ts`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Create `src/modules/agent/agentRoute.ts`**

```ts
import AgentPage from './pages/AgentPage.vue'
import CreateNewThread from './pages/CreateNewThread.vue'

export const agentRoutes = [
  {
    path: 'thread/new',
    name: 'threadNew',
    component: CreateNewThread,
  },
  {
    path: 'thread/:threadId',
    children: [
      {
        path: '',
        redirect: { name: 'agent' },
      },
      {
        path: 'agent',
        name: 'agent',
        component: AgentPage,
      },
    ],
  },
]
```

Note: the `git`, `preview`, and `files` children belong to their own module route files. The router composes them.

- [ ] **Step 2: Update `src/router/index.ts`**

```ts
import { agentRoutes } from '@/modules/agent/agentRoute'
```

Replace the inline `thread/new` and `thread/:threadId/agent` entries with `...agentRoutes`.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor(agent): extract agentRoute.ts, slim router"
```

---

## Task 10: agent — add Tanstack Query hooks for thread management

**Files:**
- Create: `src/modules/agent/hooks/useThreads.ts`
- Create: `src/modules/agent/hooks/useThreads.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/modules/agent/hooks/useThreads.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { useThreads } from './useThreads'

const mockThreadManagementService = {
  loadThreads: vi.fn().mockResolvedValue([
    { id: 't-1', projectId: 'proj-1', title: 'Thread 1' },
  ]),
  createThread: vi.fn().mockResolvedValue({ id: 't-2', projectId: 'proj-1', title: '' }),
  removeThread: vi.fn().mockResolvedValue(undefined),
  updateThreadName: vi.fn().mockResolvedValue(undefined),
  getThread: vi.fn().mockResolvedValue(null),
  updateThread: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/app-context/useAppContext', () => ({
  useAppContext: () => ({ threadManagementService: mockThreadManagementService }),
}))

describe('useThreads', () => {
  it('loads threads for a project', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const TestComponent = defineComponent({
      setup() {
        const projectId = ref('proj-1')
        const { data } = useThreads(projectId)
        return { data }
      },
      template: '<div />',
    })

    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(mockThreadManagementService.loadThreads).toHaveBeenCalledWith('proj-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- hooks/useThreads
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/modules/agent/hooks/useThreads.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import type { CreateThreadInput, UpdateThreadInput } from '@shared/ipc'
import { useAppContext } from '@/app-context/useAppContext'

export function useThreads(projectId: Ref<string>) {
  const { threadManagementService } = useAppContext()
  return useQuery({
    queryKey: ['agent', 'threads', projectId],
    queryFn: () => threadManagementService.loadThreads(projectId.value),
    enabled: () => !!projectId.value,
  })
}

export function useCreateThread() {
  const { threadManagementService } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateThreadInput) => threadManagementService.createThread(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'threads'] }),
  })
}

export function useRemoveThread() {
  const { threadManagementService } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (threadId: string) => threadManagementService.removeThread(threadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'threads'] }),
  })
}

export function useUpdateThread() {
  const { threadManagementService } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateThreadInput) => threadManagementService.updateThread(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent', 'threads'] }),
  })
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- hooks/useThreads
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/hooks/
git commit -m "feat(agent): add Tanstack Query hooks for thread management"
```

---

## Task 11: explorer — reorganise into subdirs and move FileTreeNode

**Files:**
- Move: `src/components/FileTreeNode.vue` → `src/modules/explorer/components/`
- Move: `src/components/__tests__/FileSearchEditor.test.ts` → `src/modules/explorer/components/__tests__/`
- Move: `src/modules/explorer/ExplorerLayout.vue` → `src/modules/explorer/pages/`
- Move: `src/modules/explorer/FilePage.vue` → `src/modules/explorer/pages/`
- Move: `src/modules/explorer/explorerShellContext.ts` → `src/modules/explorer/services/`
- Move: `src/modules/explorer/explorerEditorBridge.ts` → `src/modules/explorer/services/`
- Move: `src/modules/explorer/useExplorerFilePage.ts` → `src/modules/explorer/hooks/`
- Move: `src/modules/explorer/fileSearchEditorPageContext.ts` → `src/modules/explorer/hooks/`

- [ ] **Step 1: Move files**

```bash
mv src/components/FileTreeNode.vue src/modules/explorer/components/
mv src/components/__tests__/FileSearchEditor.test.ts src/modules/explorer/components/__tests__/
mv src/modules/explorer/ExplorerLayout.vue src/modules/explorer/pages/
mv src/modules/explorer/FilePage.vue src/modules/explorer/pages/
mv src/modules/explorer/explorerShellContext.ts src/modules/explorer/services/
mv src/modules/explorer/explorerEditorBridge.ts src/modules/explorer/services/
mv src/modules/explorer/useExplorerFilePage.ts src/modules/explorer/hooks/
mv src/modules/explorer/fileSearchEditorPageContext.ts src/modules/explorer/hooks/
```

- [ ] **Step 2: Find and update all imports**

```bash
grep -rl "FileTreeNode\|ExplorerLayout\|FilePage\|explorerShellContext\|explorerEditorBridge\|useExplorerFilePage\|fileSearchEditorPageContext" src/ --include="*.ts" --include="*.vue"
```

Update each import to the new path.

- [ ] **Step 3: Update explorerRoute.ts to use new page paths**

In `src/modules/explorer/explorerRoute.ts`, update imports:

```ts
import ExplorerLayout from './pages/ExplorerLayout.vue'
import FilePage from './pages/FilePage.vue'
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor(explorer): reorganise explorer module into subdirs"
```

---

## Task 12: explorer — wire explorerRoute into router

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Verify explorerRoute.ts exports a route object**

Check `src/modules/explorer/explorerRoute.ts`. It should export a `explorerRoutes` constant. If it exports individual items, wrap them:

```ts
// src/modules/explorer/explorerRoute.ts — ensure this export exists
export const explorerRoutes = {
  path: 'files',
  component: ExplorerLayout,
  children: [
    { path: '', name: 'filesPanel', component: FilePage },
    { path: ':filename(.*)', name: 'fileDetail', component: FilePage },
  ],
}
```

- [ ] **Step 2: Update router to use explorerRoutes**

In `src/router/index.ts`:

```ts
import { explorerRoutes } from '@/modules/explorer/explorerRoute'
```

Replace the inline `files` route block with `explorerRoutes`.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor(explorer): wire explorerRoute into router aggregator"
```

---

## Task 13: browser — move PreviewPanel and extract browserRoute.ts

**Files:**
- Move: `src/components/PreviewPanel.vue` → `src/modules/browser/components/`
- Move: `src/components/__tests__/PreviewPanel.test.ts` → `src/modules/browser/components/__tests__/`
- Move: `src/modules/browser/BrowserPage.vue` → `src/modules/browser/pages/`
- Create: `src/modules/browser/browserRoute.ts`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Move files**

```bash
mv src/components/PreviewPanel.vue src/modules/browser/components/
mv src/components/__tests__/PreviewPanel.test.ts src/modules/browser/components/__tests__/
mv src/modules/browser/BrowserPage.vue src/modules/browser/pages/
```

- [ ] **Step 2: Find and update imports**

```bash
grep -rl "PreviewPanel\|BrowserPage" src/ --include="*.ts" --include="*.vue"
```

Update each to the new path.

- [ ] **Step 3: Create `src/modules/browser/browserRoute.ts`**

```ts
import BrowserPage from './pages/BrowserPage.vue'

export const browserRoutes = {
  path: 'preview',
  name: 'previewPanel',
  component: BrowserPage,
}
```

- [ ] **Step 4: Update router**

```ts
import { browserRoutes } from '@/modules/browser/browserRoute'
```

Replace the inline `preview` route entry with `browserRoutes`.

- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(browser): move browser components and extract browserRoute"
```

---

## Task 14: welcome — extract welcomeRoute.ts

**Files:**
- Move: `src/modules/welcome/WelcomePage.vue` → `src/modules/welcome/pages/`
- Create: `src/modules/welcome/welcomeRoute.ts`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Move WelcomePage**

```bash
mkdir -p src/modules/welcome/pages
mv src/modules/welcome/WelcomePage.vue src/modules/welcome/pages/
```

- [ ] **Step 2: Create `src/modules/welcome/welcomeRoute.ts`**

```ts
import WelcomePage from './pages/WelcomePage.vue'

export const welcomeRoutes = {
  path: '/',
  name: 'welcome',
  component: WelcomePage,
}
```

- [ ] **Step 3: Update router**

```ts
import { welcomeRoutes } from '@/modules/welcome/welcomeRoute'
```

Replace the inline welcome route with `welcomeRoutes`.

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor(welcome): extract welcomeRoute.ts, slim router"
```

---

## Task 15: Slim router to final aggregator form

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Verify router now imports only module routes**

`src/router/index.ts` should look like this after all previous tasks:

```ts
import { createMemoryHistory, createRouter } from "vue-router"
import Layout from "@/layouts/Layout.vue"
import { welcomeRoutes } from "@/modules/welcome/welcomeRoute"
import { agentRoutes } from "@/modules/agent/agentRoute"
import { gitRoutes } from "@/modules/git/gitRoute"
import { explorerRoutes } from "@/modules/explorer/explorerRoute"
import { browserRoutes } from "@/modules/browser/browserRoute"
import { useWorkspaceStore } from "@/stores/workspaceStore"
import { decodeBranch, encodeBranch } from "./branchParam"
import { persistWorkspaceRouteFromNavigation } from "./workspaceRouteMemory"

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    welcomeRoutes,
    {
      path: "/:projectId/:branch",
      name: "workspace",
      component: Layout,
      children: [
        ...agentRoutes,
        gitRoutes,
        explorerRoutes,
        browserRoutes,
      ],
    },
  ],
})

// Keep the existing beforeEach and afterEach guards exactly as they are —
// they reference workspaceStore and branchParam utilities that are cross-module concerns.
```

- [ ] **Step 2: Remove any remaining direct component imports from router**

```bash
grep "^import.*\.vue" src/router/index.ts
```

Expected: only `Layout.vue` (which is the cross-module workspace shell).

- [ ] **Step 3: Run typecheck and full test suite**

```bash
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 4: Final commit**

```bash
git add src/
git commit -m "refactor(router): finalise slim router aggregator"
```

---

## Task 16: Promote cross-module UI components and cleanup

**Files:**
- Verify `src/components/` contains only genuinely cross-module items
- Verify `src/stores/` contains only `workspaceStore` and `keybindingsStore`
- Verify `src/services/` is empty and delete it

- [ ] **Step 1: Audit remaining src/components/**

```bash
ls src/components/
```

Expected remaining (do NOT move these — they are cross-module):
- `MonacoDiffEditor.vue` + test
- `MonacoEditor.vue` + test
- `ProjectTabs.vue` + test
- `ui/sidebar/` directory

If any module-specific component remains, move it to its module now following the same pattern as Tasks 1–13.

- [ ] **Step 2: Audit remaining src/stores/**

```bash
ls src/stores/
```

Expected: only `workspaceStore.ts`, `keybindingsStore.ts`, and their tests.

- [ ] **Step 3: Delete empty src/services/ if it exists**

```bash
ls src/services/ 2>/dev/null && rmdir src/services/ || echo "already removed"
```

- [ ] **Step 4: Run full suite one final time**

```bash
npm run typecheck && npm run test
```

Expected: all pass with zero type errors.

- [ ] **Step 5: Final cleanup commit**

```bash
git add src/
git commit -m "chore: verify cross-module boundaries and cleanup empty dirs"
```
