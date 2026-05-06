# Process Folder

This folder is the implementation log for **WEDDZ PM**. Every meaningful change to the project is captured here as a numbered Markdown file so we can trace decisions, rationale, and acceptance criteria long after the fact.

## Naming convention

```
00-MASTER-PLAN.md           ← single source of truth, edited only when scope changes
NN-phase-<short-name>.md    ← one per build phase (Phase 01, 02, …)
NN-change-<short-name>.md   ← out-of-band changes that don't belong to a phase
```

## What belongs in each phase file

- **Goal** — one sentence: what this phase ships.
- **Tasks** — bulleted list of work items.
- **Files touched** — paths created or edited, with one-line purpose each.
- **Acceptance criteria** — manual / automated checks the phase must pass before being marked done.
- **Decisions** — anything we picked over an alternative; one-line *why*.
- **Commit(s)** — the SHA(s) and conventional message(s) the phase produced.
- **Open questions / follow-ups** — things the next phase needs to know.

## Workflow

1. Before starting a phase: copy/scaffold its MD file from the master plan's phase summary.
2. Update the file as work progresses. Don't wait until the end.
3. When the phase is acceptance-tested, fill in **Commit(s)** and mark the phase **Done**.
4. Commit the MD file alongside the code change for that phase.

## Index

- [00-MASTER-PLAN.md](00-MASTER-PLAN.md) — full architecture, schema, phases, conventions
- [01-change-rename-and-multiuser.md](01-change-rename-and-multiuser.md) — rename FellowCRM → WEDDZ PM, switch to multi-user shared workspace with roles
- [02-phase-foundation.md](02-phase-foundation.md) — Phase 01: Vite + React + Tailwind scaffold, deps, lib utilities
- [03-phase-database.md](03-phase-database.md) — Phase 02: SQL migration, storage policies, Edge Function for team member creation
- [04-phase-auth-layout.md](04-phase-auth-layout.md) — Phase 03: Auth context, layout shell, route guards, UI primitives
- [05-phase-team-members.md](05-phase-team-members.md) — Phase 04: /admin/users with Add/Edit team member modals (Edge Function client)
- [06-phase-customers.md](06-phase-customers.md) — Phase 05: customer CRUD with list, detail tabs, and form modal
- [07-phase-projects.md](07-phase-projects.md) — Phase 06: project CRUD with status filter, updates log, default kanban columns
- [08-phase-invoices.md](08-phase-invoices.md) — Phase 07: invoice CRUD with auto-numbering, line items, mark paid, print view
- [09-phase-expenses.md](09-phase-expenses.md) — Phase 08: expense CRUD with month selector, category/scope filters, monthly summary
- [10-phase-employees-salary.md](10-phase-employees-salary.md) — Phase 09: employee directory + monthly salaries with pay/unpay RPCs
- (more files appear as phases land)
