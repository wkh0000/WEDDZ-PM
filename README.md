# FellowCRM

Internal Project Management & CRM tool for **WEDDZ IT**.

> Hosted free on Vercel (frontend) + Supabase (backend). Designed for ~5–20 internal users.

## What it does

- **Customers** — CRUD with company, contact info, and per-customer project/invoice history.
- **Projects** — CRUD with status, budget, customer link, project updates log.
- **Invoices** — Auto-numbered (`INV-0001`, …), line items, tax, mark as paid, printable view.
- **Expenses** — General or project-linked, categorized, with receipt uploads and monthly summary.
- **Employees & Salaries** — Employee directory, monthly salary records, mark-paid auto-creates a linked expense.
- **Kanban Task Manager** — Trello/Jira-style board per project: drag-drop columns, priorities, labels, assignees, comments, checklists, attachments, activity feed, multi-user realtime.
- **Insights** — Revenue vs expenses, project profitability, monthly trends, top customers, cash flow charts.

## Stack

- React 18 + Vite + React Router v6
- Tailwind CSS (no UI library — hand-rolled components)
- Framer Motion + Lucide React
- @dnd-kit for kanban drag-and-drop
- Recharts for insights
- Supabase (PostgreSQL + Auth + RLS + Realtime + Storage)
- Vercel hosting

## Currency & dates

- Currency: **LKR** with comma formatting (`LKR 125,000.00`)
- Dates: **`06 May 2026`** (`dd MMM yyyy`)

## Documentation

- See [`process/00-MASTER-PLAN.md`](process/00-MASTER-PLAN.md) for the full architecture, schema, and build plan.
- Each build phase has its own MD file in [`process/`](process/).

## Quick start

> Detailed setup is in `process/00-MASTER-PLAN.md` § J.

```bash
npm install
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## Status

Pre-implementation. Phase 01 (Foundation) is next.
