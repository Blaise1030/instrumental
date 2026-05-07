# Git Service SCM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all SCM operations (stage, unstage, discard, commit, fetch, push, status) from direct `window.workspaceApi` calls in `scmStore` to the `GitService` abstraction, replacing the Pinia store with a `useScm` Vue Query composable.

**Architecture:** Extend the `GitService` interface and `IpcGitService` implementation with 10 new SCM methods. Create a `useScm(cwd)` composable using `useQuery` for status and `useMutation` for each write operation. Update `SourceControlPanel` to use `useScm` and hold UI-only state (selected file, commit message) as local refs. Delete `scmStore.ts`.

**Tech Stack:** TypeScript, Vue 3, Pinia (removed), TanStack Vue Query (`useQuery`, `useMutation`, `useQueryClient`), Vitest, `@vue/test-utils`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/desktop/src/modules/git/services/gitService.ts` | Add 10 SCM methods to interface |
| Modify | `apps/desktop/src/modules/git/services/ipcGitService.ts` | Implement 10 new methods; extend `WorkspaceApi` type |
| Create | `apps/desktop/src/modules/git/hooks/useScm.ts` | `useQuery` + `useMutation` composable |
| Create | `apps/desktop/src/modules/git/hooks/useScm.test.ts` | Tests for `useScm` |
| Modify | `apps/desktop/src/modules/git/components/SourceControlPanel.vue` | Replace `useScmStore` with `useScm`; move UI state to local refs |
| Delete | `apps/desktop/src/modules/git/stores/scmStore.ts` | Deprecated |

---

## Task 1: Extend `GitService` interface

**Files:**
- Modify: `apps/desktop/src/modules/git/services/gitService.ts`

- [ ] **Step 1: Replace the file content with the extended interface**

```typescript
import type { RepoScmSnapshot } from "@shared/ipc";

/** Git operations abstracted from Electron IPC (see `ipcGitService.ts`). */
export interface GitService {
  listWorktrees(cwd: string): Promise<GitWorktreeListEntry[]>;
  listBranchesExcludingWorktrees(cwd: string): Promise<string[]>;
  getCurrentBranch(cwd: string): Promise<string>;
  checkoutBranch(cwd: string, branch: string): Promise<void>;

  /**
   * Full repo status snapshot. Returns `null` when `cwd` is not inside a git repository.
   */
  getStatus(cwd: string): Promise<RepoScmSnapshot | null>;

  stagePaths(cwd: string, paths: string[]): Promise<void>;
  stageAll(cwd: string): Promise<void>;
  unstagePaths(cwd: string, paths: string[]): Promise<void>;
  unstageAll(cwd: string): Promise<void>;
  discardPaths(cwd: string, paths: string[]): Promise<void>;
  discardAll(cwd: string): Promise<void>;
  commit(cwd: string, message: string): Promise<void>;
  fetch(cwd: string): Promise<void>;
  push(cwd: string): Promise<void>;
}
```

Note: keep the existing `import type { GitWorktreeListEntry }` at the top and add `RepoScmSnapshot` to it.

The full corrected import line:
```typescript
import type { GitWorktreeListEntry, RepoScmSnapshot } from "@shared/ipc";
```

- [ ] **Step 2: Verify TypeScript compiles (IpcGitService will fail — that's expected)**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | grep gitService
```

Expected: errors about `IpcGitService` not implementing the new methods. No errors inside `gitService.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/services/gitService.ts
git commit -m "feat(git): extend GitService interface with SCM operations"
```

---

## Task 2: Implement new methods in `IpcGitService`

**Files:**
- Modify: `apps/desktop/src/modules/git/services/ipcGitService.ts`

- [ ] **Step 1: Extend the local `WorkspaceApi` type** (the type at the top of the file, before `branchFromRepoStatus`)

Add these fields to the existing `WorkspaceApi` type:

```typescript
type WorkspaceApi = {
  // existing fields (keep as-is)
  gitListWorktrees?: (cwd: string) => Promise<GitWorktreeListEntry[]>;
  gitListBranchesExcludingWorktrees?: (cwd: string) => Promise<string[]>;
  gitCheckoutBranch?: (cwd: string, branch: string) => Promise<void>;
  repoStatus?: (cwd: string) => Promise<RepoScmSnapshot | RepoStatusEntry[]>;
  changedFiles?: (cwd: string) => Promise<string[]>;
  // new fields
  isGitRepository?: (cwd: string) => Promise<boolean>;
  stagePaths?: (cwd: string, paths: string[]) => Promise<void>;
  stageAll?: (cwd: string) => Promise<void>;
  unstagePaths?: (cwd: string, paths: string[]) => Promise<void>;
  unstageAll?: (cwd: string) => Promise<void>;
  discardPaths?: (cwd: string, paths: string[]) => Promise<void>;
  discardAll?: (cwd: string) => Promise<void>;
  commitStaged?: (cwd: string, message: string) => Promise<void>;
  gitFetch?: (cwd: string) => Promise<void>;
  gitPush?: (cwd: string) => Promise<void>;
};
```

- [ ] **Step 2: Add `getStatus` implementation** (add after `checkoutBranch` inside the class)

```typescript
async getStatus(cwd: string): Promise<RepoScmSnapshot | null> {
  const a = this.requireApi();
  if (a.isGitRepository) {
    let inside = false;
    try { inside = await a.isGitRepository(cwd); } catch { inside = false; }
    if (!inside) return null;
  }
  if (!a.repoStatus) return null;
  const raw = await a.repoStatus(cwd);
  if (Array.isArray(raw)) {
    return { entries: raw, branch: "", shortLabel: "", lastCommitSubject: null };
  }
  return raw;
}
```

- [ ] **Step 3: Add staging/unstaging/discard/commit/fetch/push implementations**

```typescript
async stagePaths(cwd: string, paths: string[]): Promise<void> {
  const a = this.requireApi();
  if (a.stagePaths) {
    await a.stagePaths(cwd, paths);
  } else if (a.stageAll) {
    await a.stageAll(cwd);
  } else {
    throw new Error("workspaceApi.stagePaths is not available.");
  }
}

async stageAll(cwd: string): Promise<void> {
  const a = this.requireApi();
  if (!a.stageAll) throw new Error("workspaceApi.stageAll is not available.");
  await a.stageAll(cwd);
}

async unstagePaths(cwd: string, paths: string[]): Promise<void> {
  const a = this.requireApi();
  if (!a.unstagePaths) throw new Error("workspaceApi.unstagePaths is not available. Restart the desktop app.");
  await a.unstagePaths(cwd, paths);
}

async unstageAll(cwd: string): Promise<void> {
  const a = this.requireApi();
  if (!a.unstageAll) throw new Error("workspaceApi.unstageAll is not available. Restart the desktop app.");
  await a.unstageAll(cwd);
}

async discardPaths(cwd: string, paths: string[]): Promise<void> {
  const a = this.requireApi();
  if (!a.discardPaths) throw new Error("workspaceApi.discardPaths is not available. Restart the desktop app.");
  await a.discardPaths(cwd, paths);
}

async discardAll(cwd: string): Promise<void> {
  const a = this.requireApi();
  if (!a.discardAll) throw new Error("workspaceApi.discardAll is not available.");
  await a.discardAll(cwd);
}

async commit(cwd: string, message: string): Promise<void> {
  const a = this.requireApi();
  if (!a.commitStaged) throw new Error("workspaceApi.commitStaged is not available. Use git commit in the terminal.");
  await a.commitStaged(cwd, message);
}

async fetch(cwd: string): Promise<void> {
  const a = this.requireApi();
  if (!a.gitFetch) throw new Error("workspaceApi.gitFetch is not available.");
  await a.gitFetch(cwd);
}

async push(cwd: string): Promise<void> {
  const a = this.requireApi();
  if (!a.gitPush) throw new Error("workspaceApi.gitPush is not available.");
  await a.gitPush(cwd);
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | grep -E "error|ipcGitService"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/git/services/ipcGitService.ts
git commit -m "feat(git): implement SCM methods in IpcGitService"
```

---

## Task 3: Create `useScm` composable

**Files:**
- Create: `apps/desktop/src/modules/git/hooks/useScm.ts`

- [ ] **Step 1: Write the failing test first** (`apps/desktop/src/modules/git/hooks/useScm.test.ts`)

```typescript
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useScm } from "./useScm";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";
import type { RepoScmSnapshot } from "@shared/ipc";

const mockSnapshot: RepoScmSnapshot = {
  entries: [
    { path: "src/foo.ts", originalPath: null, stagedKind: "modified", unstagedKind: null, isUntracked: false },
  ],
  branch: "main",
  shortLabel: "main",
  lastCommitSubject: "initial commit",
};

const { mockGitService, appContextRef } = vi.hoisted(() => {
  const { ref: vueRef } = require("vue") as typeof import("vue");
  const mockGitService = {
    listWorktrees: vi.fn().mockResolvedValue([]),
    listBranchesExcludingWorktrees: vi.fn().mockResolvedValue([]),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    checkoutBranch: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue(mockSnapshot),
    stagePaths: vi.fn().mockResolvedValue(undefined),
    stageAll: vi.fn().mockResolvedValue(undefined),
    unstagePaths: vi.fn().mockResolvedValue(undefined),
    unstageAll: vi.fn().mockResolvedValue(undefined),
    discardPaths: vi.fn().mockResolvedValue(undefined),
    discardAll: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
  };
  const appContextRef = vueRef({
    mode: "desktop" as const,
    threadManagementService: {} as unknown as ThreadManagementService,
    gitService: mockGitService,
  });
  return { mockGitService, appContextRef };
});

vi.mock("@/app-context/useAppContext", () => ({
  useAppContext: () => appContextRef,
}));

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("useScm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches repo status for a given cwd", async () => {
    const queryClient = makeQueryClient();
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        const scm = useScm(cwd);
        return { scm };
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(mockGitService.getStatus).toHaveBeenCalledWith("/repo");
    });
  });

  it("exposes repoStatus entries from snapshot", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return { scm: capturedScm };
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(capturedScm!.repoStatus.value).toEqual(mockSnapshot.entries);
    });
  });

  it("exposes hasGitRepository as true when snapshot returned", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(capturedScm!.hasGitRepository.value).toBe(true);
    });
  });

  it("exposes hasGitRepository as false when getStatus returns null", async () => {
    mockGitService.getStatus.mockResolvedValueOnce(null);
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(capturedScm!.hasGitRepository.value).toBe(false);
    });
  });

  it("stagePaths mutation calls gitService.stagePaths", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await capturedScm!.stagePaths.mutateAsync(["src/foo.ts"]);
    expect(mockGitService.stagePaths).toHaveBeenCalledWith("/repo", ["src/foo.ts"]);
  });

  it("commit mutation calls gitService.commit", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await capturedScm!.commit.mutateAsync("feat: add something");
    expect(mockGitService.commit).toHaveBeenCalledWith("/repo", "feat: add something");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (file not yet created)**

```bash
cd apps/desktop && npx vitest run src/modules/git/hooks/useScm.test.ts 2>&1 | tail -20
```

Expected: FAIL — `useScm` not found.

- [ ] **Step 3: Create `useScm.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, unref } from "vue";
import type { Ref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";

export function useScm(cwd: Ref<string>) {
  const appContext = useAppContext();
  const queryClient = useQueryClient();
  const queryKey = computed(() => ["git", "scm", unref(cwd)] as const);

  const statusQuery = useQuery({
    queryKey,
    queryFn: () => appContext.value.gitService.getStatus(unref(cwd)),
    enabled: computed(() => Boolean(unref(cwd))),
  });

  const repoStatus = computed(() => statusQuery.data.value?.entries ?? []);
  const scmMeta = computed(() => ({
    branch: statusQuery.data.value?.branch ?? "",
    shortLabel: statusQuery.data.value?.shortLabel ?? "",
    lastCommitSubject: statusQuery.data.value?.lastCommitSubject ?? null,
  }));
  const hasGitRepository = computed(
    () => statusQuery.data.value !== null && statusQuery.data.value !== undefined
  );

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: queryKey.value });
  }

  const stagePaths = useMutation({
    mutationFn: (paths: string[]) =>
      appContext.value.gitService.stagePaths(unref(cwd), paths),
    onSuccess: invalidate,
  });

  const stageAll = useMutation({
    mutationFn: () => appContext.value.gitService.stageAll(unref(cwd)),
    onSuccess: invalidate,
  });

  const unstagePaths = useMutation({
    mutationFn: (paths: string[]) =>
      appContext.value.gitService.unstagePaths(unref(cwd), paths),
    onSuccess: invalidate,
  });

  const unstageAll = useMutation({
    mutationFn: () => appContext.value.gitService.unstageAll(unref(cwd)),
    onSuccess: invalidate,
  });

  const discardPaths = useMutation({
    mutationFn: (paths: string[]) =>
      appContext.value.gitService.discardPaths(unref(cwd), paths),
    onSuccess: invalidate,
  });

  const discardAll = useMutation({
    mutationFn: () => appContext.value.gitService.discardAll(unref(cwd)),
    onSuccess: invalidate,
  });

  const commit = useMutation({
    mutationFn: (message: string) =>
      appContext.value.gitService.commit(unref(cwd), message),
    onSuccess: invalidate,
  });

  const fetch = useMutation({
    mutationFn: () => appContext.value.gitService.fetch(unref(cwd)),
    onSuccess: invalidate,
  });

  const push = useMutation({
    mutationFn: () => appContext.value.gitService.push(unref(cwd)),
    onSuccess: invalidate,
  });

  return {
    statusQuery,
    repoStatus,
    scmMeta,
    hasGitRepository,
    stagePaths,
    stageAll,
    unstagePaths,
    unstageAll,
    discardPaths,
    discardAll,
    commit,
    fetch,
    push,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run src/modules/git/hooks/useScm.test.ts 2>&1 | tail -20
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/git/hooks/useScm.ts apps/desktop/src/modules/git/hooks/useScm.test.ts
git commit -m "feat(git): add useScm composable with Vue Query"
```

---

## Task 4: Update `SourceControlPanel` to use `useScm`

**Files:**
- Modify: `apps/desktop/src/modules/git/components/SourceControlPanel.vue`

This task replaces the `useScmStore()` call and migrates all state/action references. The template is large — work methodically through each reference.

- [ ] **Step 1: Update the script setup imports**

Remove:
```typescript
import { useScmStore } from "@/modules/git/stores/scmStore";
```

Add:
```typescript
import { useScm } from "@/modules/git/hooks/useScm";
import { useToast } from "@/composables/useToast";
```

- [ ] **Step 2: Replace `scm` initialization and add local UI state**

Remove:
```typescript
const scm = useScmStore();
const workspace = useWorkspaceStore();
const { activeWorktree } = useActiveWorkspace();

const scmFetchAvailable = computed(() => !!window.workspaceApi?.gitFetch);
const scmPushAvailable = computed(() => !!window.workspaceApi?.gitPush);
const scmCommitAvailable = computed(() => !!window.workspaceApi?.commitStaged);
```

Add:
```typescript
const workspace = useWorkspaceStore();
const { activeWorktree } = useActiveWorkspace();
const toast = useToast();

const cwd = computed(() => activeWorktree.value?.path ?? "");
const scm = useScm(cwd);

// UI-only state (not server state)
const selectedScmPath = ref<string | null>(null);
const selectedScmScope = ref<"staged" | "unstaged" | null>(null);
const commitMessage = ref("");
```

- [ ] **Step 3: Add auto-selection watcher**

Add this watch after the UI state refs:

```typescript
watch(scm.repoStatus, (status) => {
  const hasSelection =
    selectedScmPath.value &&
    selectedScmScope.value &&
    status.some((entry) => {
      if (entry.path !== selectedScmPath.value) return false;
      return selectedScmScope.value === "staged"
        ? Boolean(entry.stagedKind)
        : Boolean(entry.unstagedKind || entry.isUntracked);
    });
  if (hasSelection) return;

  const firstStaged = status.find((e) => e.stagedKind);
  if (firstStaged) {
    selectedScmPath.value = firstStaged.path;
    selectedScmScope.value = "staged";
    return;
  }
  const firstUnstaged = status.find((e) => e.unstagedKind || e.isUntracked);
  selectedScmPath.value = firstUnstaged?.path ?? null;
  selectedScmScope.value = firstUnstaged ? "unstaged" : null;
});
```

- [ ] **Step 4: Update all `scm.*` references in script setup**

Replace these patterns throughout the script setup section (not the template — that comes next):

| Old | New |
|-----|-----|
| `scm.repoStatus` | `scm.repoStatus.value` |
| `scm.scmMeta` | `scm.scmMeta.value` |
| `scm.hasGitRepository` | `scm.hasGitRepository.value` |
| `scm.selectedScmPath` | `selectedScmPath` |
| `scm.selectedScmScope` | `selectedScmScope` |
| `scm.scmCommitMessage` | `commitMessage` |
| `scm.scmFetchBusy` | `scm.fetch.isPending` |
| `scm.scmPushBusy` | `scm.push.isPending` |
| `scm.scmCommitBusy` | `scm.commit.isPending` |
| `scm.selectedMergeResult` | (keep calling `window.workspaceApi` directly — fileMergeSides is a UI concern) |
| `scm.selectedDiffLoading` | (keep local state as-is) |

Replace action calls:

| Old | New |
|-----|-----|
| `scm.stageSelected(paths)` | `await scm.stagePaths.mutateAsync(paths)` |
| `scm.unstageSelected(paths)` | `await scm.unstagePaths.mutateAsync(paths)` |
| `scm.discardSelected(paths)` | `await scm.discardPaths.mutateAsync(paths)` |
| `scm.stageAll()` | `scm.stageAll.mutate()` |
| `scm.unstageAll()` | `scm.unstageAll.mutate()` |
| `scm.discardAll()` | `scm.discardAll.mutate()` |
| `scm.scmFetch()` | `scm.fetch.mutate()` |
| `scm.scmPush()` | `scm.push.mutate()` |
| `scm.scmCommit()` | `await scm.commit.mutateAsync(commitMessage.value.trim()); commitMessage.value = ""` |
| `scm.selectScmEntry({ path, scope })` | `selectedScmPath.value = path; selectedScmScope.value = scope` |
| `scm.refreshRepoStatus()` | `await queryClient.invalidateQueries({ queryKey: ["git", "scm", cwd.value] })` |

For mutations that previously showed toasts on error (unstage, discard, commit, fetch, push), add `onError` in the `useScm` composable — OR handle errors in the component where the mutation is called. The simplest approach since `useScm` already exists: add `onError` callbacks at the component call site using the mutation's `.mutateAsync()` with a try/catch:

```typescript
// Example for commit (replaces scm.scmCommit):
async function handleCommit() {
  const message = commitMessage.value.trim();
  if (!message) return;
  try {
    await scm.commit.mutateAsync(message);
    commitMessage.value = "";
  } catch (e) {
    toast.error("Commit failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}
```

Apply the same pattern for `fetch` and `push`:

```typescript
async function handleFetch() {
  try {
    await scm.fetch.mutateAsync();
  } catch (e) {
    toast.error("Fetch failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function handlePush() {
  try {
    await scm.push.mutateAsync();
    toast.success("Push succeeded", `Branch \`${scm.scmMeta.value.branch}\` was pushed to the remote.`);
  } catch (e) {
    toast.error("Push failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}
```

- [ ] **Step 5: Update template bindings**

In the template, replace every `scm.*` reference to match the new names:

| Old template binding | New |
|----------------------|-----|
| `scm.repoStatus` | `scm.repoStatus` (already a computed ref, Vue auto-unwraps in template) |
| `scm.scmMeta.branch` | `scm.scmMeta.branch` |
| `scm.hasGitRepository` | `scm.hasGitRepository` |
| `scm.selectedScmPath` | `selectedScmPath` |
| `scm.selectedScmScope` | `selectedScmScope` |
| `scm.scmCommitMessage` | `commitMessage` |
| `scm.scmFetchBusy` | `scm.fetch.isPending` |
| `scm.scmPushBusy` | `scm.push.isPending` |
| `scm.scmCommitBusy` | `scm.commit.isPending` |
| `@click="scm.scmFetch()"` | `@click="handleFetch()"` |
| `@click="scm.scmPush()"` | `@click="handlePush()"` |
| `@click="scm.scmCommit()"` | `@click="handleCommit()"` |
| `scmFetchAvailable` | Remove guard — always render, rely on error toast |
| `scmPushAvailable` | Remove guard — always render |
| `scmCommitAvailable` | Remove guard — always render |

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | grep SourceControlPanel
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/modules/git/components/SourceControlPanel.vue
git commit -m "feat(git): migrate SourceControlPanel to useScm composable"
```

---

## Task 5: Delete `scmStore`

**Files:**
- Delete: `apps/desktop/src/modules/git/stores/scmStore.ts`

- [ ] **Step 1: Check for any remaining imports of scmStore**

```bash
cd apps/desktop && grep -r "scmStore\|useScmStore" src/ --include="*.ts" --include="*.vue"
```

Expected: zero matches (after Task 4 is complete).

- [ ] **Step 2: Delete the file**

```bash
rm apps/desktop/src/modules/git/stores/scmStore.ts
```

- [ ] **Step 3: Verify TypeScript still compiles cleanly**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Run all git module tests**

```bash
cd apps/desktop && npx vitest run src/modules/git/ 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(git): delete deprecated scmStore"
```

---

## Self-Review

**Spec coverage:**
- ✅ `GitService` extended with `getStatus`, `stagePaths`, `stageAll`, `unstagePaths`, `unstageAll`, `discardPaths`, `discardAll`, `commit`, `fetch`, `push`
- ✅ `IpcGitService` implements all new methods
- ✅ `useScm` composable with `useQuery` + `useMutation`
- ✅ `SourceControlPanel` uses `useScm`, UI state local
- ✅ `scmStore` deleted
- ✅ `fileMergeSides` left as direct `window.workspaceApi` call (UI concern, by design)

**Type consistency check:**
- `getStatus` returns `RepoScmSnapshot | null` — consistent across interface, implementation, and composable
- `stagePaths`/`unstagePaths`/`discardPaths` take `(cwd: string, paths: string[])` — consistent across all tasks
- `commit` takes `(cwd: string, message: string)` — consistent
- Mutation `mutateAsync` call signatures match what the service methods expect
