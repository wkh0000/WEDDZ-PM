# Phase 07 — Invoices

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Auto-numbered invoices with line items, tax, mark-paid, and a printable A4 view.

## Tasks
- [x] `features/invoices/api.js` — listInvoices (joined customer + project), getInvoice (joined detail), listInvoiceItems, nextInvoiceNumber (RPC), createInvoice (insert + items), updateInvoice (replaces items), deleteInvoice, markInvoicePaid, setInvoiceStatus.
- [x] `InvoiceLineItems` — repeater with live amount/subtotal/tax/total recompute.
- [x] `InvoiceFormModal` — invoice number auto-fetched on open, customer + optional project, dates, status, tax %, line items, notes.
- [x] `InvoicesListPage` — status filter chips, search, summary tiles (filtered total / unpaid / paid), row actions including Mark Paid.
- [x] `InvoiceDetailPage` — full view with bill-to + items + totals + project link, Mark Paid + Print + Edit + Delete actions.
- [x] `InvoicePrintPage` — clean white-bg A4 view at `/invoices/:id/print` with native `window.print()`.
- [x] Routes wired.
- [x] Build: 185 KB gz JS.

## Decisions
- **Atomic update of items = delete + insert** when editing. Simpler than diffing positions and updating in place; OK because items aren't huge and there's no audit trail on items.
- **Tax is a single rate** (not per-line). Matches typical Sri Lankan VAT/GST structure.
- **Invoice number is fetched on modal open** via RPC and stored in form state. The actual sequence still increments inside the RPC, so even if the user cancels, the number was claimed — small leak but acceptable trade-off vs. the race that would happen if we generated client-side.
- **Print page bypasses the AppShell** by being a top-level route. White background, dark ink, system fonts in `@media print`.

## Commit
`feat(phase-07): invoice CRUD with auto-numbering, line items, mark paid, and print view`
