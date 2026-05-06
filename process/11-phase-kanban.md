# Phase 10 — Kanban

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Trello/Jira-style board per project with drag-and-drop, multi-user realtime, full task drawer (description, comments, checklist, attachments, labels, activity), and configurable columns + labels.

## Tasks
- [x] `features/tasks/api.js` — full surface: columns CRUD + reorder, tasks CRUD, `move_task` RPC wrapper, labels CRUD + assign/detach, checklist CRUD, comments CRUD with profile join, attachments (upload to `task-attachments` bucket + signed URL on view), activity feed read.
- [x] `TaskCard` — sortable card with priority dot, due date, assignee avatar, label color stripes.
- [x] `Column` — sortable + droppable, inline rename, dropdown actions, in-column "Add task" form.
- [x] `TaskDetailDrawer` — title (inline edit), assignee/priority/due/complete-toggle row, label chips, description, tabbed footer for Comments / Checklist / Attachments / Activity.
- [x] `TaskCommentsThread` — Cmd+Enter to send, author avatars, owner-only delete.
- [x] `TaskChecklist` — toggle, progress bar, inline add, delete on hover.
- [x] `TaskAttachments` — upload (10 MB cap), open via signed URL, delete.
- [x] `TaskActivityFeed` — vertical timeline driven by `task_activity` rows.
- [x] `BoardFilters` — assignee/priority/label multi-filter chips.
- [x] `useBoardRealtime` — subscribes to `tasks` + `task_columns` postgres_changes for live updates.
- [x] `BoardPage` — DndContext root with `closestCorners`, drag overlay, optimistic local position rebuild + server `move_task` RPC, column-reorder via `arrayMove`, label management modal, add column modal.
- [x] Routes wired.
- [x] Build: 219 KB gz JS.

## Decisions
- **`@dnd-kit/sortable` for both columns and tasks** sharing the same `DndContext`. We discriminate via `data.current.type === 'column' | 'task'` in the drop handler.
- **Optimistic move** rebuilds positions client-side and calls `move_task` RPC server-side. If the RPC fails, we reload from source.
- **Realtime calls `load()` wholesale** rather than diffing. For an internal team this is plenty; the wire is small and the visual experience is consistent with the source of truth.
- **Comment activity & task activity** are written by the API layer (not DB triggers) so the activity payload shape is shaped by the front-end and we can format snippets cleanly.
- **Attachments use signed URLs** with 1-hour TTL (`createSignedUrl`). Buckets are private; URLs aren't durable.
- **Reorder column on drag-end** uses sequential `update` calls; OK for ≤20 columns.

## Commit
`feat(phase-10): kanban board with dnd-kit, task drawer, comments, checklist, attachments, labels, realtime`
