# WEDDZ PM

Internal Project Management & CRM tool for **WEDDZ IT**.

> Hosted free on Vercel (frontend) + Supabase (backend). Designed for ~5–20 internal team members with role-based access.

## What it does

- **Customers** — CRUD with company, contact info, and per-customer project/invoice history.
- **Projects** — CRUD with status, budget, customer link, project updates log.
- **Invoices** — Auto-numbered (`INV-0001`, …), line items, tax, mark as paid, printable view.
- **Expenses** — General or project-linked, categorized, with receipt uploads and monthly summary.
- **Employees & Salaries** *(super admin only)* — Employee directory, monthly salary records; mark-paid auto-creates a linked expense.
- **Team Members** *(super admin only)* — Add team members from inside the app; no public signup.
- **Kanban Task Manager** — Trello/Jira-style board per project: drag-drop columns, priorities, labels, assignees, comments, checklists, attachments, activity feed, multi-user realtime.
- **Insights** — Revenue vs expenses, project profitability, monthly trends, top customers, cash flow charts.

## Roles

- **super_admin** — full access including HR, payroll, and team-member management.
- **member** — full access to operational tables (customers, projects, invoices, expenses, kanban). Cannot see employees, salaries, or `/admin/users`.

The first user to sign up during initial setup is automatically promoted to `super_admin`. After that, public signup is disabled — the super admin adds members from inside the app.

## Stack

- React 18 + Vite + React Router v6
- Tailwind CSS (no UI library — hand-rolled components)
- Framer Motion + Lucide React
- @dnd-kit for kanban drag-and-drop
- Recharts for insights
- Supabase (PostgreSQL + Auth + RLS + Realtime + Storage + Edge Functions)
- Vercel hosting

## Currency & dates

- Currency: **LKR** with comma formatting (`LKR 125,000.00`)
- Dates: **`06 May 2026`** (`dd MMM yyyy`)

## Documentation

- See [`process/00-MASTER-PLAN.md`](process/00-MASTER-PLAN.md) for the full architecture, schema, and 13-phase build plan.
- Each build phase has its own MD file in [`process/`](process/). Out-of-band scope changes also live there as `NN-change-*.md`.

## Quick start

> Detailed setup is in [`process/00-MASTER-PLAN.md`](process/00-MASTER-PLAN.md) § J.

```bash
npm install
cp .env.example .env.local
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_NAME
npm run dev
```

## Status

🟢 **Live** at https://weddz-pm.vercel.app/

All 13 phases complete. Founder + first member signed in. End-to-end QA passed for: auth, RLS, customers CRUD, projects CRUD with auto-created kanban columns, kanban (board + task drawer + comments + attachments + labels), invoices, expenses, employees + salaries, dashboard, insights, and the `create-team-member` Edge Function.

Public signup is disabled — new team members are added via `/admin/users` (super_admin only).
