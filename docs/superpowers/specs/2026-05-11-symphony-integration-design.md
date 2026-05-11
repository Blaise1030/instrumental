# Symphony Integration Design

**Date:** 2026-05-11
**Status:** Approved
**Branch:** Symphony

---

## 1. Problem Statement

Users of the workbench face three compounding bottlenecks when shipping with coding agents:

- **Setup friction** — creating a thread and writing the right prompt for each issue is manual and repetitive.
- **Throughput** — running many issues concurrently requires constant babysitting.
- **Handoff quality** — agents finish work but users lack a clear path from done → reviewed → merged.

This spec defines how to integrate OpenAI Symphony's orchestration model into the workbench to eliminate all three.

---

## 2. Approach

**Embedded Electron daemon (Approach A).**

A `SymphonyOrchestrator` service runs inside the Electron main process. It polls Linear and GitHub, reads `WORKFLOW.md` from each project repo, and drives the existing `createThread → run:start` IPC pipeline. No new processes, no new protocols — the workbench's existing thread/run infrastructure handles execution.

The app must be open for the daemon to run. This is acceptable for a desktop tool and can be evolved to a menu-bar persistent mode later.

---

## 3. Architecture

```
Electron Main Process
├── SymphonyOrchestrator          ← polling loop + dispatch logic
│   ├── TrackerAdapter/Linear     ← Linear GraphQL client
│   ├── TrackerAdapter/GitHub     ← GitHub REST/GraphQL client
│   ├── WorkflowReader            ← reads + parses WORKFLOW.md from repo root
│   └── CompletionHandler         ← executes on_complete (open_pr | commit | mark_done)
│
└── existing IPC handlers (unchanged)
    ├── workspace:createThread
    └── run:start
```

### New modules

| Path | Responsibility |
|------|---------------|
| `electron/symphony/orchestrator.ts` | Poll loop, eligibility checks, dispatch, reconciliation |
| `electron/symphony/workflowReader.ts` | Parse WORKFLOW.md front matter + body template |
| `electron/symphony/adapters/linear.ts` | Linear GraphQL adapter |
| `electron/symphony/adapters/github.ts` | GitHub REST/GraphQL adapter |
| `electron/symphony/completionHandler.ts` | Post-run actions (PR, commit, mark done) |
| `electron/symphony/types.ts` | Shared types: `SymphonyConfig`, `TrackerIssue`, `KanbanColumn` |

### Storage

A new `project_symphony_config` table in the existing SQLite store holds per-project tracker credentials and config (kind, API key, project slug). No new database file.

---

## 4. WORKFLOW.md Schema

Located at the repo root. Front matter is machine-readable config; markdown body is the agent prompt template.

The schema follows the [Symphony reference WORKFLOW.md](https://raw.githubusercontent.com/openai/symphony/refs/heads/main/elixir/WORKFLOW.md) with two workbench-specific extensions: `tracker.kind: github` support and a `kanban` block that drives the Symphony tab UI.

```markdown
---
tracker:
  kind: linear | github          # "github" is a workbench extension
  project_slug: "owner/repo"     # Linear project slug or GitHub owner/repo
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Done

polling:
  interval_ms: 60000

workspace:
  root: ~/code/symphony-workspaces

hooks:
  after_create: |
    git clone --depth 1 <repo-url> .
  before_remove: |
    echo "cleaning up"

agent:
  max_concurrent_agents: 3
  max_turns: 20
  on_complete: open_pr           # workbench extension: open_pr | commit | mark_done

codex:
  command: claude                # claude | codex | gemini | cursor
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite

# workbench extension — drives Symphony tab kanban columns
kanban:
  columns:
    - label: "Todo"        state: "Todo"
    - label: "In Progress" state: "In Progress"
    - label: "In Review"   state: "Merging"
    - label: "Done"        state: "Done"
---

You are working on a Linear ticket `{{ issue.identifier }}`

{% if attempt %}
Continuation context:
- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
{% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}
```

**Template variables:** `{{ issue.identifier }}`, `{{ issue.title }}`, `{{ issue.description }}`, `{{ issue.state }}`, `{{ issue.labels }}`, `{{ issue.url }}`, `{{ attempt }}`

**If `WORKFLOW.md` is absent:** the project is skipped by the orchestrator entirely — no silent defaults.

`WorkflowReader` re-reads the file on every dispatch tick so policy changes take effect without restarting the app.

---

## 5. Dispatch Flow

```
Poll tick (every poll_interval_seconds)
  │
  ├─ read WORKFLOW.md → skip project if absent or invalid
  ├─ fetch candidate issues from tracker (active_states filter)
  ├─ skip issues already running (thread exists + run is active)
  ├─ skip if at max_concurrent limit
  │
  └─ for each new eligible issue:
       1. workspace:createThread  — title: issue.title, agent: from WORKFLOW.md
                                    metadata: { source: "symphony", issueId, issueUrl, identifier }
       2. run:start               — prompt: rendered WORKFLOW.md body

Reconciliation loop (every poll tick, per active symphony run)
  ├─ issue still in active state?           → keep running
  ├─ issue moved to cancelled/done externally? → run:interrupt
  └─ run status = done | failed?
       └─ CompletionHandler:
            open_pr   → git push branch, open PR via tracker/GitHub API
            commit    → git commit, set thread status = needsReview
            mark_done → call tracker API to transition issue state
```

Threads are tagged `source: "symphony"` in metadata so the Symphony tab can filter them. No worktree creation — agents run in the project's default working tree.

---

## 6. UI

### View Toggle (top-right of `WorkspaceLayout.vue`)

Two icon buttons in the top-right corner of the existing `WorkspaceLayout.vue` toggle the entire main area between:

- **Chat view** — the current workbench layout (thread sidebar + agent terminal + diff/source control panels), unchanged
- **Kanban view** — the Symphony board

Toggle state is persisted to localStorage per-project. The toggle is only visible when a Symphony-enabled project is active.

### Empty State (Kanban view, no WORKFLOW.md)

When `WORKFLOW.md` is absent or has no `kanban.columns`, the Kanban view shows:

```
⚡ Symphony not configured

Add a WORKFLOW.md to your repo root to define your
kanban columns and connect your issue tracker.

[ View template ]   [ Open in editor ]
```

- **View template** — inline starter `WORKFLOW.md` displayed in a modal.
- **Open in editor** — opens/creates `WORKFLOW.md` in the workbench's CodeMirror editor.

### Kanban View

Columns are derived from `kanban.columns` in `WORKFLOW.md` — not hardcoded. Column order matches the array order. Cards are not user-draggable; status is driven by the tracker and agent.

```
┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────┐
│   Todo   │  │In Progress│  │  In Review  │  │   Done   │
│──────────│  │──────────│  │─────────────│  │──────────│
│ PROJ-51  │  │ PROJ-42  │  │  PROJ-38    │  │ PROJ-33  │
│Dark mode │  │Fix login │  │ CSV export  │  │Onboarding│
│          │  │ ● 4m     │  │ PR #91 ↗    │  │PR #88 ✓  │
└──────────┘  └──────────┘  └─────────────┘  └──────────┘
```

Each card shows: issue identifier, title, status badge, elapsed time or contextual action link ("View PR", "Retry", "Stop").

### Task Sheet (sidebar, opens on card click)

Clicking a kanban card opens a **sidebar sheet** that slides in from the right. The kanban board remains visible behind it. The sheet has a compact issue header and two tabs:

```
┌───────────────────────────────────────┐
│ PROJ-42  Fix login timeout  ● Running │
│ linear.app/issue/...            [✕]   │
│───────────────────────────────────────│
│ [ Chat ]  [ Diff ]                    │
│───────────────────────────────────────│
│                                       │
│  (tab content)                        │
│                                       │
└───────────────────────────────────────┘
```

- **Chat tab** — live agent terminal output using the existing `AgentPane` component
- **Diff tab** — git diff of changed files using the existing `DiffReviewPanel` component; when a PR has been opened, a PR link appears at the top of this tab. Tab is disabled (greyed out) until the agent has produced changes.

Closing the sheet returns focus to the kanban board with no view change.

---

## 7. Error Handling

### Tracker errors
API auth failures, network timeouts, rate limits. Orchestrator logs and skips dispatch for the current tick; retries next interval. Symphony tab shows a banner: "Tracker unreachable — retrying in 60s". No running tasks are affected.

### Agent errors
Run exits non-zero or exceeds `agent.timeout_seconds`. Task card moves to **Failed** and shows the last agent output line as the error hint. User can retry from the card — orchestrator re-runs `run:start` on the same thread.

### Completion errors
`open_pr` or `mark_done` API call fails. Task moves to **Needs Review** with a "Complete manually" prompt. Agent's work is preserved; only the handoff step failed.

### Observability
All orchestrator errors are written to a Symphony-scoped log. A "View logs" link in the Symphony tab header surfaces the full log without leaving the app. No silent failures.

---

## 8. Out of Scope

- Worktree-per-issue isolation (Symphony tab abstracts this away; users see tasks only)
- Draggable kanban columns or custom column ordering via UI
- Headless/daemon mode (Approach B) — deferred to v2
- Menu-bar persistent mode (Approach C) — deferred to v2
- Any tracker beyond Linear and GitHub Issues at launch
