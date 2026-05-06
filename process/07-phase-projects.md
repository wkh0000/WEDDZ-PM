# Phase 06 — Projects

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Project CRUD + status filter + immutable updates timeline + auto-seed default kanban columns on create.

## Tasks
- [x] `features/projects/api.js` — listProjects (joined customer), getProject (joined customer), createProject (also inserts 4 default task_columns), updateProject, deleteProject, listProjectUpdates (joined author profile), addProjectUpdate, listProjectInvoices, listProjectExpenses.
- [x] `ProjectFormModal` — name, customer FK select, status, budget, start/end dates, description.
- [x] `ProjectUpdatesLog` — post + list with author avatars and timestamps, framer-motion stagger.
- [x] `ProjectsListPage` — card grid with status filter chips, debounced search, framer-motion stagger entrance.
- [x] `ProjectDetailPage` — Overview / Updates / Invoices / Expenses tabs, Open Board CTA, financial summary card.
- [x] Routes wired.
- [x] `npm run build` — 180 KB gz JS.

## Decisions
- **Default columns are inserted client-side** on `createProject`. Best-effort: the project still exists if the seed fails, and the user can add columns later from the board.
- **Card grid** for projects (instead of table) — projects are more "visual" entities than customers; the card UI gives more breathing room for the meta (customer, dates, budget).
- **Status filter chips** are stateless URL-independent; status is a small enum, no need for URL persistence.
- **Updates use a Postgres self-referential profile join** via the `created_by` foreign key. The query is `select … created_by, author:profiles!project_updates_created_by_fkey(...)` — Supabase needs the explicit FK alias when there are multiple FK paths.

## Commit
`feat(phase-06): project CRUD with status filter, updates log, default kanban columns on create`
