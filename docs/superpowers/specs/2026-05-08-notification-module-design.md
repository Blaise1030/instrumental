# Notification Module Design

**Date:** 2026-05-08  
**Status:** Approved

## Overview

Add a notification module that surfaces thread completion statuses (done / needsReview / failed) as in-app notifications. The backend (Electron `NotificationStore` + IPC handlers) already exists. This spec covers the frontend service layer, composable, and UI.

## Architecture

The feature follows the existing `IpcGitService` / `IpcThreadManagementService` pattern:

1. A `NotificationService` interface defines the contract.
2. `IpcNotificationService` implements it over Electron IPC.
3. The service is instantiated in `AppContext.vue` and provided via `AppContext`.
4. A `useNotifications` composable wraps TanStack Query and reacts to backend push events.
5. `NotificationPopover.vue` renders the bell icon + popup in the `SidebarFooter` of `Layout.vue`.

No Pinia store is introduced — data flows through TanStack Query only.

## Service Layer

**Files:**
- `apps/desktop/src/modules/notification/services/notificationService.ts`
- `apps/desktop/src/modules/notification/services/ipcNotificationService.ts`

**Interface:**
```ts
interface NotificationService {
  list(): Promise<AppNotification[]>
  markRead(id: string): Promise<void>
  markAllRead(): Promise<void>
  onDidChange(cb: () => void): () => void  // returns unsubscribe fn
}
```

`IpcNotificationService` maps each method to the corresponding `window.workspaceApi` call. `onDidChange` registers a listener on `IPC_CHANNELS.notificationsDidChange` and returns a cleanup function that removes it.

## AppContext Wiring

- `apps/desktop/src/app-context/type.ts`: add `notificationService: NotificationService` to the `AppContext` type.
- `apps/desktop/src/app-context/AppContext.vue`: instantiate `new IpcNotificationService()` in the `"desktop"` branch alongside the other services.

## Composable

**File:** `apps/desktop/src/modules/notification/composables/useNotifications.ts`

Uses `useQuery` with key `["notifications"]`, calling `notificationService.list()`. On mount registers `notificationService.onDidChange(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))` and unregisters on unmount.

Exports:
- `notifications` — `Ref<AppNotification[]>`
- `unreadCount` — `ComputedRef<number>` (count where `read === false`)
- `markRead(id: string)` — calls service + invalidates query
- `markAllRead()` — calls service + invalidates query

## UI Component

**File:** `apps/desktop/src/modules/notification/components/NotificationPopover.vue`

Located in `<SidebarFooter>` next to the Terminal button in `Layout.vue`.

**Trigger:** A `Bell` icon button. When `unreadCount > 0` a numeric badge overlays the icon.

**Popover content (opens above footer):**
- Header row: "Notifications" label + "Mark all read" button (hidden when all read).
- Scrollable list of `AppNotification` items, each showing:
  - Status icon: checkmark (done), eye (needsReview), X (failed).
  - Thread title + project name.
  - Relative timestamp.
  - Unread items have a subtle highlight background.
- Clicking a row: calls `markRead(id)` + navigates to `{ name: "thread", params: { projectId, threadId } }` + closes popover.
- Empty state: "No notifications" message.

## Layout.vue Change

Import `NotificationPopover` and add it to `<SidebarFooter>` alongside the existing Terminal button. No structural changes to the layout.

## Data Flow

```
Electron main process
  └─ thread run completes → NotificationStore.add() → emitNotificationsDidChange()
        └─ IPC push: notificationsDidChange
              └─ IpcNotificationService.onDidChange callback fires
                    └─ queryClient.invalidateQueries(["notifications"])
                          └─ useQuery re-fetches → UI updates badge + list
```

## Error Handling

- If `list()` fails, TanStack Query retries with its default backoff; the badge simply shows nothing rather than erroring.
- `markRead` / `markAllRead` failures are silent (fire-and-forget); the query invalidation ensures eventual consistency on next successful fetch.

## Out of Scope

- OS-level system notifications (separate concern).
- Notification preferences / filtering.
- Pagination (backend caps at 20 entries).
