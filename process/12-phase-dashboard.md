# Phase 11 — Dashboard

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Replace the placeholder home page with real stat cards, recent projects, and upcoming invoices driven by Supabase aggregates.

## Tasks
- [x] `features/dashboard/api.js` — `dashboardSummary()` parallel-fetches counts and totals; `recentProjects(limit)`; `upcomingInvoices(days)`.
- [x] `features/dashboard/pages/DashboardPage.jsx` — personalized greeting, four stat cards (Customers, Active Projects, Unpaid Invoices, This Month's Expenses), Recent projects list, Upcoming due list.
- [x] Routes wired (replaces ComingSoon at `/`).
- [x] Build: 220 KB gz JS (kanban bundle dominates; dashboard deltas are minor).

## Decisions
- **Compact LKR for stat cards** (`formatLKRCompact`): big numbers like 1.2M fit better than `LKR 1,234,567.89` in the small card.
- **Stat-card stagger animation** with framer-motion variants — matches the rest of the app's entrance choreography.
- **Right-rail panel for upcoming invoices**: 14-day window covers the typical billing cadence without overflowing.
- **No client-side caching for the dashboard** — counts are cheap and freshness matters more than perf here. Consider `useSupabaseQuery` cache later if it becomes an issue.

## Commit
`feat(phase-11): dashboard with stat cards, recent projects, upcoming invoices`
