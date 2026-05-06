# Phase 08 — Expenses

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** General + project-linked expenses with category filter, month selector, and visual monthly breakdown.

## Tasks
- [x] `features/expenses/api.js` — listExpenses with filters (date range, category, scope), CRUD, monthlySummary aggregation, uploadReceipt + getReceiptUrl helpers.
- [x] `ExpenseFormModal` — description, amount, category, date, optional project, notes.
- [x] `MonthlySummary` — total + per-category bar chart with framer-motion bars.
- [x] `ExpensesListPage` — month navigator (prev/next/today), scope filter (All / General / Project), category filter chips, search, table.
- [x] Salary-linked expenses are visually marked (lock icon) and protected from edit/delete in the UI; the dropdown action is disabled and a toast points users to the Salaries page.
- [x] Routes wired.
- [x] Build: 187 KB gz JS.

## Decisions
- **Salary-row protection in UI** instead of via DB constraint. The `pay_salary`/`unpay_salary` RPCs are the canonical write paths for those rows. The UI prevents accidents; if an admin really wants to delete one, they go through the Salaries page.
- **Per-month aggregation done client-side** (sum + group by category) by hitting `/expenses` with a date-range filter. Cheap; the data is small. We avoid a custom SQL view.
- **Receipt upload helpers exist but aren't wired into the form yet** — receipts will hook in via a dedicated drag-and-drop block during Phase 13 polish (low priority for MVP).

## Commit
`feat(phase-08): expense CRUD with general/project scope, category filter, monthly summary`
