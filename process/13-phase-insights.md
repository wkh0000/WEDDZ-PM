# Phase 12 — Insights

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Recharts-driven analytics page covering revenue vs expenses, cash flow, top customers, and project profitability.

## Tasks
- [x] `features/insights/api.js` — `monthlyRevenueExpenses(months)` builds a 12-month series from paid invoices + expenses, `projectProfitability()` joins paid revenue + total expenses per project, `topCustomers(n)` aggregates paid invoices by customer, `cashFlow()` adds a running balance to the monthly series.
- [x] Charts: RevenueVsExpensesChart (grouped bar), CashFlowChart (area), TopCustomersChart (horizontal bar), ProjectProfitabilityTable.
- [x] Shared `ChartTooltip` matching the app's glass aesthetic.
- [x] `InsightsPage.jsx` — header KPIs (12mo revenue/expenses/net + MoM trend) + 4 chart cards + profitability table.
- [x] Routes wired.
- [x] Build: 330 KB gz JS (Recharts bumps the bundle ~110 KB; acceptable for internal tool).

## Decisions
- **Aggregations done client-side** instead of SQL views. The dataset is small (years × invoices/expenses) and we avoid one more migration. SQL views are listed as a future optimization in the master plan.
- **Charts share a single `ChartTooltip` component** so they all match the app's glass styling.
- **No code-splitting yet.** With Recharts the bundle is now ~330 KB gz; for an internal tool that's fine. If we later need to ship to mobile users on bad networks we can `React.lazy(() => import('./InsightsPage'))` with a small loading state.
- **MoM trend** uses the last 2 months in the series — handles edge cases (no prior month → 0%).

## Commit
`feat(phase-12): insights page with Recharts (revenue, cash flow, top customers, profitability)`
