# Symphony Kanban UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Kanban view and view toggle in `Layout.vue` — the Symphony tab UI that shows issues as cards across columns, opens a task sheet with agent output + diff, and shows an empty state when WORKFLOW.md is absent.

**Architecture:** The Kanban view is **not a route** — it is a second view slot inside `Layout.vue` toggled by a `ref` persisted to `localStorage` per-project. A new `src/modules/symphony/` module owns the kanban components. `AgentPane` and `DiffReviewPanel` (already in the `agent` and `git` modules) are reused directly in the `TaskSheet` sidebar.

**Prerequisites:** Plan `2026-05-11-symphony-orchestrator.md` must be fully merged first — this plan depends on `window.symphonyApi` and `src/shared/symphony.ts` being present.

**Tech Stack:** Vue 3 Composition API, Tanstack Query (`useQuery`), `@vueuse/core` `useLocalStorage`, shadcn-vue UI primitives, Vitest + Vue Test Utils

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/src/modules/symphony/symphonyIpcKeys.ts` | Renderer-side IPC channel name constants |
| Create | `apps/desktop/src/modules/symphony/hooks/useSymphonyConfig.ts` | Tanstack Query composable — fetch per-project Symphony config |
| Create | `apps/desktop/src/modules/symphony/hooks/useSymphonyTasks.ts` | Tanstack Query composable — fetch tasks, listen for `symphony:didChange` |
| Create | `apps/desktop/src/modules/symphony/components/SymphonyEmptyState.vue` | Empty state shown when WORKFLOW.md absent |
| Create | `apps/desktop/src/modules/symphony/components/__tests__/SymphonyEmptyState.test.ts` | Empty state tests |
| Create | `apps/desktop/src/modules/symphony/components/KanbanCard.vue` | Single issue card |
| Create | `apps/desktop/src/modules/symphony/components/__tests__/KanbanCard.test.ts` | Card tests |
| Create | `apps/desktop/src/modules/symphony/components/KanbanBoard.vue` | Columns layout with cards |
| Create | `apps/desktop/src/modules/symphony/components/TaskSheet.vue` | Right-side sheet with Chat + Diff tabs |
| Create | `apps/desktop/src/modules/symphony/pages/SymphonyPage.vue` | Top-level page composing board + sheet |
| Modify | `apps/desktop/src/layouts/Layout.vue` | Add view toggle button + conditional Symphony slot |

---

## Task 1: Symphony IPC Keys

**Files:**
- Create: `apps/desktop/src/modules/symphony/symphonyIpcKeys.ts`

- [ ] **Step 1.1: Create the key constants**

Create `apps/desktop/src/modules/symphony/symphonyIpcKeys.ts`:

```typescript
export const SYMPHONY_IPC = {
  GET_CONFIG: 'symphony:getConfig',
  SET_CONFIG: 'symphony:setConfig',
  DELETE_CONFIG: 'symphony:deleteConfig',
  GET_TASKS: 'symphony:getTasks',
  DID_CHANGE: 'symphony:didChange',
} as const;
```

- [ ] **Step 1.2: Commit**

```bash
git add apps/desktop/src/modules/symphony/symphonyIpcKeys.ts
git commit -m "feat(symphony-ui): add symphony IPC key constants"
```

---

## Task 2: useSymphonyConfig composable

**Files:**
- Create: `apps/desktop/src/modules/symphony/hooks/useSymphonyConfig.ts`

- [ ] **Step 2.1: Implement the composable**

Create `apps/desktop/src/modules/symphony/hooks/useSymphonyConfig.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { Ref } from 'vue';
import type { SymphonyStoredConfig, SymphonySetConfigInput } from '@/shared/symphony';

export function useSymphonyConfig(projectId: Ref<string>) {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['symphony', 'config', projectId],
    queryFn: () =>
      window.symphonyApi.getConfig({ projectId: projectId.value }) as Promise<SymphonyStoredConfig | null>,
    enabled: !!projectId.value,
  });

  const { mutate: saveConfig } = useMutation({
    mutationFn: (payload: SymphonySetConfigInput) => window.symphonyApi.setConfig(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['symphony', 'config', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['symphony', 'tasks', projectId] });
    },
  });

  const { mutate: deleteConfig } = useMutation({
    mutationFn: () => window.symphonyApi.deleteConfig({ projectId: projectId.value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['symphony', 'config', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['symphony', 'tasks', projectId] });
    },
  });

  return { config, isLoading, saveConfig, deleteConfig };
}
```

- [ ] **Step 2.2: Commit**

```bash
git add apps/desktop/src/modules/symphony/hooks/useSymphonyConfig.ts
git commit -m "feat(symphony-ui): add useSymphonyConfig composable"
```

---

## Task 3: useSymphonyTasks composable

**Files:**
- Create: `apps/desktop/src/modules/symphony/hooks/useSymphonyTasks.ts`

- [ ] **Step 3.1: Implement the composable**

Create `apps/desktop/src/modules/symphony/hooks/useSymphonyTasks.ts`:

```typescript
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { SymphonyTasksSnapshot } from '@/shared/symphony';

export function useSymphonyTasks(projectId: Ref<string>) {
  const queryClient = useQueryClient();

  const { data: snapshot, isLoading, error } = useQuery<SymphonyTasksSnapshot>({
    queryKey: ['symphony', 'tasks', projectId],
    queryFn: () => window.symphonyApi.getTasks({ projectId: projectId.value }),
    enabled: !!projectId.value,
    refetchInterval: false,
  });

  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    unsubscribe = window.symphonyApi.onDidChange(() => {
      void queryClient.invalidateQueries({ queryKey: ['symphony', 'tasks', projectId] });
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return { snapshot, isLoading, error };
}
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/desktop/src/modules/symphony/hooks/useSymphonyTasks.ts
git commit -m "feat(symphony-ui): add useSymphonyTasks composable with didChange listener"
```

---

## Task 4: SymphonyEmptyState component

**Files:**
- Create: `apps/desktop/src/modules/symphony/components/SymphonyEmptyState.vue`
- Create: `apps/desktop/src/modules/symphony/components/__tests__/SymphonyEmptyState.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `apps/desktop/src/modules/symphony/components/__tests__/SymphonyEmptyState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SymphonyEmptyState from '../SymphonyEmptyState.vue';

describe('SymphonyEmptyState', () => {
  it('renders the heading', () => {
    const wrapper = mount(SymphonyEmptyState);
    expect(wrapper.text()).toContain('Symphony not configured');
  });

  it('emits view-template when button clicked', async () => {
    const wrapper = mount(SymphonyEmptyState);
    const btn = wrapper.findAll('button').find((b) => b.text().includes('View template'));
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    expect(wrapper.emitted('view-template')).toHaveLength(1);
  });

  it('emits open-editor when button clicked', async () => {
    const wrapper = mount(SymphonyEmptyState);
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Open in editor'));
    expect(btn).toBeDefined();
    await btn!.trigger('click');
    expect(wrapper.emitted('open-editor')).toHaveLength(1);
  });
});
```

- [ ] **Step 4.2: Run test — expect failure**

```bash
cd apps/desktop && pnpm test -- SymphonyEmptyState
```

Expected: `Cannot find module '../SymphonyEmptyState.vue'`

- [ ] **Step 4.3: Implement the component**

Create `apps/desktop/src/modules/symphony/components/SymphonyEmptyState.vue`:

```vue
<script setup lang="ts">
const emit = defineEmits<{
  'view-template': [];
  'open-editor': [];
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
    <span class="text-3xl">⚡</span>
    <h2 class="text-lg font-semibold">Symphony not configured</h2>
    <p class="text-sm text-muted-foreground max-w-xs">
      Add a <code class="font-mono text-xs bg-muted px-1 rounded">WORKFLOW.md</code>
      to your repo root to define your kanban columns and connect your issue tracker.
    </p>
    <div class="flex gap-2 mt-2">
      <button
        class="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        @click="emit('view-template')"
      >
        View template
      </button>
      <button
        class="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        @click="emit('open-editor')"
      >
        Open in editor
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4.4: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test -- SymphonyEmptyState
```

Expected: all 3 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/desktop/src/modules/symphony/components/SymphonyEmptyState.vue apps/desktop/src/modules/symphony/components/__tests__/SymphonyEmptyState.test.ts
git commit -m "feat(symphony-ui): add SymphonyEmptyState component"
```

---

## Task 5: KanbanCard component

**Files:**
- Create: `apps/desktop/src/modules/symphony/components/KanbanCard.vue`
- Create: `apps/desktop/src/modules/symphony/components/__tests__/KanbanCard.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `apps/desktop/src/modules/symphony/components/__tests__/KanbanCard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import KanbanCard from '../KanbanCard.vue';
import type { SymphonyTask } from '@/shared/symphony';

const BASE_TASK: SymphonyTask = {
  issueId: 'iss-1',
  issueIdentifier: 'PROJ-42',
  issueTitle: 'Fix login timeout',
  issueUrl: 'https://linear.app/issue/PROJ-42',
  issueState: 'In Progress',
  threadId: 'thread-1',
  runStatus: 'running',
  startedAt: Date.now() - 240_000,
  prUrl: null,
  errorHint: null,
};

describe('KanbanCard', () => {
  it('renders identifier and title', () => {
    const wrapper = mount(KanbanCard, { props: { task: BASE_TASK } });
    expect(wrapper.text()).toContain('PROJ-42');
    expect(wrapper.text()).toContain('Fix login timeout');
  });

  it('shows elapsed time when running', () => {
    const wrapper = mount(KanbanCard, { props: { task: BASE_TASK } });
    expect(wrapper.text()).toMatch(/\d+m/);
  });

  it('shows View PR link when prUrl is set', () => {
    const wrapper = mount(KanbanCard, {
      props: { task: { ...BASE_TASK, runStatus: 'done', prUrl: 'https://github.com/pr/1' } },
    });
    expect(wrapper.text()).toContain('View PR');
  });

  it('shows Retry when status is failed', () => {
    const wrapper = mount(KanbanCard, {
      props: { task: { ...BASE_TASK, runStatus: 'failed', errorHint: 'exit code 1' } },
    });
    expect(wrapper.text()).toContain('Retry');
  });

  it('emits click when card is clicked', async () => {
    const wrapper = mount(KanbanCard, { props: { task: BASE_TASK } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeDefined();
  });
});
```

- [ ] **Step 5.2: Run test — expect failure**

```bash
cd apps/desktop && pnpm test -- KanbanCard
```

Expected: `Cannot find module '../KanbanCard.vue'`

- [ ] **Step 5.3: Implement KanbanCard**

Create `apps/desktop/src/modules/symphony/components/KanbanCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { SymphonyTask } from '@/shared/symphony';

const props = defineProps<{ task: SymphonyTask }>();
const emit = defineEmits<{ click: [task: SymphonyTask] }>();

const statusClass = computed(() => {
  switch (props.task.runStatus) {
    case 'running': return 'text-green-500 dark:text-green-400';
    case 'failed': return 'text-red-500';
    case 'needsReview': return 'text-orange-500';
    case 'done': return 'text-green-500';
    default: return 'text-muted-foreground';
  }
});

const elapsedLabel = computed(() => {
  if (!props.task.startedAt || props.task.runStatus !== 'running') return null;
  const ms = Date.now() - props.task.startedAt;
  const mins = Math.floor(ms / 60_000);
  return `${mins}m`;
});
</script>

<template>
  <div
    class="cursor-pointer rounded-md border bg-card p-3 shadow-sm hover:shadow-md transition-shadow space-y-1.5"
    @click="emit('click', task)"
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-mono text-muted-foreground">{{ task.issueIdentifier }}</span>
      <span v-if="task.runStatus === 'running'" class="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
    </div>
    <p class="text-sm font-medium leading-tight line-clamp-2">{{ task.issueTitle }}</p>
    <div class="flex items-center gap-2 text-xs" :class="statusClass">
      <span v-if="elapsedLabel">● {{ elapsedLabel }}</span>
      <a
        v-else-if="task.prUrl"
        :href="task.prUrl"
        target="_blank"
        rel="noopener"
        class="underline"
        @click.stop
      >View PR ↗</a>
      <button
        v-else-if="task.runStatus === 'failed'"
        class="underline"
        @click.stop="emit('click', task)"
      >Retry</button>
    </div>
    <p v-if="task.errorHint && task.runStatus === 'failed'" class="text-xs text-destructive truncate">
      {{ task.errorHint }}
    </p>
  </div>
</template>
```

- [ ] **Step 5.4: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test -- KanbanCard
```

Expected: all 5 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add apps/desktop/src/modules/symphony/components/KanbanCard.vue apps/desktop/src/modules/symphony/components/__tests__/KanbanCard.test.ts
git commit -m "feat(symphony-ui): add KanbanCard component"
```

---

## Task 6: KanbanBoard component

**Files:**
- Create: `apps/desktop/src/modules/symphony/components/KanbanBoard.vue`

- [ ] **Step 6.1: Implement KanbanBoard**

Create `apps/desktop/src/modules/symphony/components/KanbanBoard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { SymphonyTask, KanbanColumn } from '@/shared/symphony';
import KanbanCard from './KanbanCard.vue';

const props = defineProps<{
  columns: KanbanColumn[];
  tasks: SymphonyTask[];
}>();

const emit = defineEmits<{ 'select-task': [task: SymphonyTask] }>();

function tasksForColumn(column: KanbanColumn): SymphonyTask[] {
  return props.tasks.filter((t) => t.issueState === column.state);
}
</script>

<template>
  <div class="flex gap-4 p-4 overflow-x-auto h-full">
    <div
      v-for="col in columns"
      :key="col.state"
      class="flex flex-col gap-2 min-w-[220px] w-[220px]"
    >
      <div class="flex items-center justify-between px-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {{ col.label }}
        </h3>
        <span class="text-xs text-muted-foreground">{{ tasksForColumn(col).length }}</span>
      </div>
      <div class="flex flex-col gap-2">
        <KanbanCard
          v-for="task in tasksForColumn(col)"
          :key="task.issueId"
          :task="task"
          @click="emit('select-task', task)"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/desktop/src/modules/symphony/components/KanbanBoard.vue
git commit -m "feat(symphony-ui): add KanbanBoard component"
```

---

## Task 7: TaskSheet component

The TaskSheet slides in from the right. It reuses `AgentPane` (from `src/modules/agent/components/AgentPane.vue`) and `DiffReviewPanel` (from `src/modules/git/components/DiffReviewPanel.vue`).

**Files:**
- Create: `apps/desktop/src/modules/symphony/components/TaskSheet.vue`

- [ ] **Step 7.1: Implement TaskSheet**

Create `apps/desktop/src/modules/symphony/components/TaskSheet.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { SymphonyTask } from '@/shared/symphony';
import AgentPane from '@/modules/agent/components/AgentPane.vue';
import DiffReviewPanel from '@/modules/git/components/DiffReviewPanel.vue';

const props = defineProps<{
  task: SymphonyTask | null;
  open: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

type SheetTab = 'chat' | 'diff';
const activeTab = ref<SheetTab>('chat');

const hasDiff = computed(
  () => props.task?.runStatus === 'done' || props.task?.runStatus === 'needsReview',
);

const statusLabel = computed(() => {
  switch (props.task?.runStatus) {
    case 'running': return '● Running';
    case 'done': return '✓ Done';
    case 'failed': return '✗ Failed';
    case 'needsReview': return '⚠ Needs Review';
    default: return '';
  }
});

const statusClass = computed(() => {
  switch (props.task?.runStatus) {
    case 'running': return 'text-green-500';
    case 'done': return 'text-green-500';
    case 'failed': return 'text-red-500';
    case 'needsReview': return 'text-orange-500';
    default: return 'text-muted-foreground';
  }
});
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-150 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="open && task"
      class="absolute right-0 top-0 h-full w-[420px] border-l bg-background shadow-xl flex flex-col z-20"
    >
      <!-- Header -->
      <div class="flex items-start justify-between px-4 py-3 border-b">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-muted-foreground">{{ task.issueIdentifier }}</span>
            <span class="text-xs" :class="statusClass">{{ statusLabel }}</span>
          </div>
          <p class="text-sm font-medium truncate mt-0.5">{{ task.issueTitle }}</p>
          <a
            v-if="task.issueUrl"
            :href="task.issueUrl"
            target="_blank"
            rel="noopener"
            class="text-xs text-muted-foreground underline"
          >{{ task.issueUrl }}</a>
        </div>
        <button
          class="ml-2 text-muted-foreground hover:text-foreground p-1 rounded"
          @click="emit('close')"
        >✕</button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b">
        <button
          v-for="tab in (['chat', 'diff'] as SheetTab[])"
          :key="tab"
          class="px-4 py-2 text-sm capitalize border-b-2 transition-colors"
          :class="activeTab === tab
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          :disabled="tab === 'diff' && !hasDiff"
          @click="activeTab = tab"
        >
          {{ tab === 'chat' ? 'Chat' : 'Diff' }}
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-hidden">
        <AgentPane
          v-if="activeTab === 'chat' && task.threadId"
          :thread-id="task.threadId"
          class="h-full"
        />
        <DiffReviewPanel
          v-else-if="activeTab === 'diff'"
          class="h-full"
        />
        <div v-else class="flex items-center justify-center h-full text-sm text-muted-foreground">
          No output yet.
        </div>
      </div>
    </div>
  </Transition>
</template>
```

> **Note:** `AgentPane` and `DiffReviewPanel` accept props that control which thread/worktree to display. Check their actual prop interfaces and adjust the bindings if they require `worktreePath` or other props beyond `threadId`.

- [ ] **Step 7.2: Run type check**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no errors (adjust AgentPane/DiffReviewPanel prop bindings if type errors appear).

- [ ] **Step 7.3: Commit**

```bash
git add apps/desktop/src/modules/symphony/components/TaskSheet.vue
git commit -m "feat(symphony-ui): add TaskSheet with Chat and Diff tabs"
```

---

## Task 8: SymphonyPage

**Files:**
- Create: `apps/desktop/src/modules/symphony/pages/SymphonyPage.vue`

- [ ] **Step 8.1: Implement SymphonyPage**

Create `apps/desktop/src/modules/symphony/pages/SymphonyPage.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSymphonyTasks } from '../hooks/useSymphonyTasks';
import KanbanBoard from '../components/KanbanBoard.vue';
import TaskSheet from '../components/TaskSheet.vue';
import SymphonyEmptyState from '../components/SymphonyEmptyState.vue';
import type { SymphonyTask } from '@/shared/symphony';

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const { snapshot, isLoading } = useSymphonyTasks(projectId);

const selectedTask = ref<SymphonyTask | null>(null);
const sheetOpen = ref(false);

function onSelectTask(task: SymphonyTask): void {
  selectedTask.value = task;
  sheetOpen.value = true;
}

function onCloseSheet(): void {
  sheetOpen.value = false;
  selectedTask.value = null;
}

function onOpenEditor(): void {
  // Navigate to WORKFLOW.md in the file explorer
  // This requires the file editor route — emit up to Layout.vue if needed
}
</script>

<template>
  <div class="relative flex flex-col h-full overflow-hidden">
    <div v-if="isLoading" class="flex items-center justify-center h-full text-sm text-muted-foreground">
      Loading…
    </div>

    <template v-else-if="snapshot">
      <!-- Tracker error banner -->
      <div
        v-if="snapshot.trackerError"
        class="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b"
      >
        Tracker unreachable — retrying in 60s. {{ snapshot.trackerError }}
      </div>

      <!-- Empty state: no WORKFLOW.md / not configured -->
      <SymphonyEmptyState
        v-if="!snapshot.enabled || snapshot.columns.length === 0"
        @view-template="() => {/* TODO: show template modal */}"
        @open-editor="onOpenEditor"
      />

      <!-- Kanban board -->
      <KanbanBoard
        v-else
        :columns="snapshot.columns"
        :tasks="snapshot.tasks"
        @select-task="onSelectTask"
      />
    </template>

    <!-- Task sheet (right sidebar) -->
    <TaskSheet
      :task="selectedTask"
      :open="sheetOpen"
      @close="onCloseSheet"
    />
  </div>
</template>
```

- [ ] **Step 8.2: Commit**

```bash
git add apps/desktop/src/modules/symphony/pages/SymphonyPage.vue
git commit -m "feat(symphony-ui): add SymphonyPage composing kanban board and task sheet"
```

---

## Task 9: Layout.vue view toggle

The view toggle is a pair of icon buttons in the top-right of `Layout.vue`. State is stored in `localStorage` keyed by `projectId`. When a Symphony-enabled project is active, the toggle is shown; clicking it swaps the main content area between the existing workbench layout and `SymphonyPage`.

**Files:**
- Modify: `apps/desktop/src/layouts/Layout.vue`

- [ ] **Step 9.1: Read Layout.vue to understand current structure**

Open `apps/desktop/src/layouts/Layout.vue` and identify:
1. Where the existing `<script setup>` block ends (to add new imports)
2. The top-right area of the header/toolbar where the toggle buttons will live
3. The main content `<slot>` or `<RouterView>` that renders the workspace content

- [ ] **Step 9.2: Add toggle state and imports**

In `Layout.vue`'s `<script setup>`, add these imports after the existing ones:

```typescript
import { useLocalStorage } from '@vueuse/core';
import SymphonyPage from '@/modules/symphony/pages/SymphonyPage.vue';
import { useSymphonyConfig } from '@/modules/symphony/hooks/useSymphonyConfig';
```

Add the toggle state and symphony config query after the existing `const` declarations:

```typescript
const symphonyView = useLocalStorage<'chat' | 'kanban'>(
  computed(() => `symphony-view-${projectId.value}`),
  'chat',
);

const { config: symphonyConfig } = useSymphonyConfig(projectId);
const symphonyEnabled = computed(() => !!symphonyConfig.value);
```

`projectId` is already declared in the existing script. The `useLocalStorage` key uses `projectId` so each project remembers its view independently.

- [ ] **Step 9.3: Add toggle buttons to the template**

Find the top-right area of `Layout.vue`'s template (look for the toolbar/header region that contains the existing settings and feedback buttons). Add the toggle buttons immediately before those buttons:

```html
<!-- Symphony view toggle — only shown when a Symphony-enabled project is active -->
<div v-if="symphonyEnabled" class="flex items-center gap-1 mr-2">
  <button
    :class="[
      'p-1.5 rounded text-sm transition-colors',
      symphonyView === 'chat'
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:text-foreground'
    ]"
    title="Chat view"
    @click="symphonyView = 'chat'"
  >
    <!-- Chat icon (two speech bubbles) -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 9.25v.75l-3.978-3.978a1 1 0 0 1-.293-.707V5a1 1 0 0 1-.724-.635ZM7.5 9.25c0-2.513 1.73-4.554 4.147-4.832a43.141 43.141 0 0 1 4.706 0c1.123.12 2.084.89 2.421 1.968.194.612.226 1.272.226 1.864v2.25a3 3 0 0 1-3 3H13.5l-3.978 3.978a1 1 0 0 1-1.415-.707V9.25Z" />
    </svg>
  </button>
  <button
    :class="[
      'p-1.5 rounded text-sm transition-colors',
      symphonyView === 'kanban'
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:text-foreground'
    ]"
    title="Kanban view"
    @click="symphonyView = 'kanban'"
  >
    <!-- Kanban columns icon -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.25 2.25 0 0 1 1 14.75l-.01-9.51Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.09Zm1.5 0h5.09a.75.75 0 0 0 .75-.75v-.615a.75.75 0 0 0-.75-.75H10.5a.75.75 0 0 0-.75.75v.625Zm6.75-3.63v-.625a.75.75 0 0 0-.75-.75H10.5a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75h6.25Z" clip-rule="evenodd" />
    </svg>
  </button>
</div>
```

- [ ] **Step 9.4: Wrap the main content area with the view switch**

Find where `Layout.vue` renders its main content (the `<RouterView />` or equivalent). Wrap it so that when `symphonyView === 'kanban'`, `SymphonyPage` renders instead:

```html
<!-- Main content area -->
<template v-if="symphonyView === 'kanban' && symphonyEnabled">
  <SymphonyPage />
</template>
<template v-else>
  <!-- existing RouterView / resizable panels — unchanged -->
  <!-- paste the existing main-content markup here without modification -->
</template>
```

The existing content block must not be touched beyond wrapping it in the `<template v-else>`. Do not restructure any of the existing panels.

- [ ] **Step 9.5: Run type check**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no errors. If `useLocalStorage` key can't be a `ComputedRef`, change to a plain `computed`-derived string:

```typescript
const storageKey = computed(() => `symphony-view-${projectId.value}`);
const symphonyView = useLocalStorage<'chat' | 'kanban'>(storageKey.value, 'chat');

// Reset when project changes
watch(storageKey, (key) => {
  const stored = localStorage.getItem(key);
  symphonyView.value = stored === 'kanban' ? 'kanban' : 'chat';
});
```

- [ ] **Step 9.6: Run all tests**

```bash
cd apps/desktop && pnpm test
```

Expected: all tests pass (no regressions in existing Layout.vue tests).

- [ ] **Step 9.7: Commit**

```bash
git add apps/desktop/src/layouts/Layout.vue
git commit -m "feat(symphony-ui): add chat/kanban view toggle to Layout.vue"
```

---

## Self-Review Checklist

| Spec requirement | Task |
|---|---|
| View toggle in `Layout.vue` top-right | Task 9 |
| Toggle only visible when Symphony-enabled project active | Task 9 step 9.2 (`symphonyEnabled` guard) |
| Toggle state persisted to localStorage per-project | Task 9 step 9.2 (`useLocalStorage`) |
| Kanban columns from `kanban.columns` in WORKFLOW.md (not hardcoded) | Task 6 — columns prop from snapshot |
| Empty state when WORKFLOW.md absent | Task 4 + Task 8 |
| "View template" button | Task 4 (`view-template` emit) |
| "Open in editor" button | Task 4 + Task 8 (`open-editor` handler) |
| Card shows identifier, title, elapsed time, PR link, Retry | Task 5 |
| Cards not user-draggable | Task 6 — no drag handlers |
| Task sheet opens on card click | Task 8 (`onSelectTask`) |
| Sheet has Chat tab (AgentPane) | Task 7 |
| Sheet has Diff tab (DiffReviewPanel) | Task 7 |
| Diff tab disabled until agent produces changes | Task 7 (`hasDiff` computed) |
| Tracker error banner | Task 8 |
| Closing sheet returns to kanban | Task 8 (`onCloseSheet`) |

**Gap noted:** "Open in editor" in `SymphonyEmptyState` emits but `SymphonyPage.onOpenEditor` is a stub. The implementation should call the existing file-open IPC (`files:read` / editor route) for `WORKFLOW.md` at the active project's `repoPath + '/WORKFLOW.md'`. Add that routing in a follow-up or extend the event to bubble up to `Layout.vue` which has router access.
