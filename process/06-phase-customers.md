# Phase 05 — Customers

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Full customer CRUD with list, detail (with tabs), and form modal.

## Tasks
- [x] `features/customers/api.js` — listCustomers, getCustomer, create/update/deleteCustomer, listCustomerProjects, listCustomerInvoices.
- [x] `features/customers/components/CustomerFormModal.jsx` — create + edit form with validation.
- [x] `features/customers/pages/CustomersListPage.jsx` — searchable, paginated by relevance, motion stagger, empty state, dropdown row actions.
- [x] `features/customers/pages/CustomerDetailPage.jsx` — Overview / Projects / Invoices tabs.
- [x] Cross-feature shared components extracted early: `ProjectStatusBadge` and `InvoiceStatusBadge` (used by detail page tabs).
- [x] Wired into `routes.jsx`.
- [x] `npm run build` — 177 KB gz JS.

## Decisions
- **Status badges live in their feature folders** (`features/projects/components/ProjectStatusBadge.jsx`) but are imported cross-feature. Reasonable — they're tiny pure components and prevent duplicate enum-to-tone maps.
- **Tabs are URL-independent state** — switching tab doesn't change the URL. Simpler than wiring nested routes for one component; revisit if SEO/deep-linking matters (it doesn't for an internal tool).
- **Created-by isn't shown in the list yet** — will surface in detail page once we add a `profiles` lookup (Phase 11 polish, low priority).

## Commit
`feat(phase-05): customer CRUD with list, detail tabs, and form modal`
