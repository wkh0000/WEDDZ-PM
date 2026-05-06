# Phase 09 — Employees + Salaries

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Super-admin-only HR module: employees CRUD with salary history and a monthly salaries page that uses the `pay_salary`/`unpay_salary` RPCs.

## Tasks
- [x] `features/employees/api.js` — employees CRUD, salaries CRUD, paySalary, unpaySalary, generateMonthlySalaries (skips employees who already have a row), employee photo upload helper.
- [x] `EmployeeFormModal` — name, role, type, base salary, joined date, active toggle, notes.
- [x] `SalaryFormModal` — employee FK, period (year/month), amount/bonus/deductions with live net amount, notes. Period + employee fields lock on edit (composite-unique constraint).
- [x] `EmployeesListPage` — table with avatar, role, type, base, joined, status. Click-row opens detail.
- [x] `EmployeeDetailPage` — avatar block, base salary, employment type, contact info, salary history table.
- [x] `SalariesPage` — month navigator + summary tiles (total / paid / pending) + "Generate from base" button + table with inline Pay/Unpay buttons + per-row dropdown.
- [x] All routes wired behind `<RoleGate>`.
- [x] Build: 192 KB gz JS.

## Decisions
- **Net is computed client-side** (`amount + bonus - deductions`) and persisted alongside the components so the SalariesPage doesn't have to recalc per render.
- **Bulk-generate skips employees who already have a row** for the period — safe to click multiple times.
- **Delete salary that's already paid** — UI auto-calls `unpay_salary` first to drop the linked expense, then deletes. Prevents orphaned salary expense records.
- **Photo upload helper exists** but isn't wired into EmployeeFormModal yet — added as a separate enhancement (Phase 13).
- **`disabled` on employee + period selects** when editing a salary because the underlying composite uniqueness `(employee_id, period_year, period_month)` makes changing them ambiguous. Edit is for amounts/notes; switch employees by deleting + adding.

## Commit
`feat(phase-09): employee directory + monthly salaries with pay/unpay RPCs`
