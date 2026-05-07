# Phase 15 — Kanban v2 + Voice input + Chat full-CRUD

**Status:** ✅ Done
**Date:** 2026-05-07
**Goal:** The user said the kanban looked too sparse vs Trello/Jira and the chat should be able to do anything (incl. voice). Three deliverables in one phase.

---

## 1. Chat assistant: full CRUD + RAG (28 new tools)

The Edge Function went from 17 → 45 tools. Reads and creates run immediately; updates and deletes pause for confirmation in the UI.

### New READ tools (insights / RAG)
- `get_business_overview(period?)` — revenue, expenses, net, by-category, top customers, unpaid totals. Periods: this_month, last_month, last_3_months, ytd, last_12_months, all_time.
- `get_project_financials(project_name)` — one project's budget, paid revenue, expenses, net, % budget consumed.
- `get_monthly_revenue_expenses(months?)` — per-month series for trend questions.
- `get_top_customers(limit?)` — leaderboard by paid revenue.
- `get_upcoming_invoice_due(days?)` — unpaid invoices due in N days.
- `monthly_expense_summary(year, month)` — total + per-category for one month.

### New CREATE tools (safe)
- `create_employee`, `create_salary`, `add_team_member` (calls the existing create-team-member Edge Function path)
- Kanban: `add_task_comment`, `add_checklist_item`, `set_checklist_item_done`, `create_task_column`, `create_label`, `attach_label`

### New UPDATE tools (unsafe — confirm required)
- `update_customer`, `update_project`, `update_task`, `update_invoice` (incl. line-item replacement with auto-recompute), `update_expense`, `update_employee`, `update_salary` (recomputes net), `update_team_member`
- `move_task` — drag-drop equivalent
- `generate_monthly_salaries`

### Extended `delete_record`
Entity enum now: customer, project, task, invoice, expense, employee, **team_member, salary, task_comment, task_checklist_item, task_column, task_label, project_update**. Accepts `name` OR `id`; the lookup is automatic with filler-word stripping for fuzzy matches like "test team member" → "Test Member".

### System prompt
Documents capabilities by category and the team_member-vs-employee distinction so Gemini picks the right tool the first time.

---

## 2. Kanban v2

### TaskCard rebuild
The old card showed labels as 8×1.5px stripes and priority as a 1.5px dot. New card shows:

| Element | Before | After |
|---|---|---|
| Labels | tiny color stripes | colored pills with names ("Bug", "Frontend") + `+N` overflow |
| Priority | 1.5px dot, hover-only | colored chip (Low/Med/High/Urgent) with dot, always visible for high/urgent |
| Due date | flat color | urgency-tinted: Overdue Xd (rose), Today (amber), Tomorrow (amber), In Nd (sky), absolute (zinc) |
| Checklist | not shown | "3/5" + filled progress bar; emerald when complete |
| Comments | not shown | 💬 N |
| Attachments | not shown | 📎 N |
| Drag handle | whole card | top-left grip on hover (cleaner click target for opening drawer) |
| Quick actions | none | "..." on hover opens drawer |
| Completed state | nothing | strike-through + emerald check |

Plus a **density toggle** ("Cozy" / "Compact") persisted in `localStorage`. Compact mode trims to a single-line title + tiny color stripes for labels + assignee avatar — fits ~3× more cards on screen.

### Quick-add expansion
Old: tiny "+ Add task" link → textarea takes title only. New flow:

- Prominent dashed-border "+ Add task" button per column
- Click → expands to a card-shaped quick-add with: title (textarea), priority chips (Low/Med/High/Urgent), due-date picker, assignee dropdown
- Enter to add, Esc to cancel
- Hint text at the bottom: "Enter to add · Esc to cancel"

### BoardSmartFilters (replacing BoardFilters)
Three rows:

1. **Search** — full-text on title + description, debounced via state. Plus density toggle. Plus Clear button (only shown when something is filtered).
2. **Smart filter chips** — one-click categorical filters:
   - Overdue (rose)
   - Due this week (amber)
   - Unassigned (zinc)
   - Assigned to me (indigo, uses the logged-in user)
   - Completed (emerald)
   Single-select; click again to toggle off.
3. **Priority chips + Assignee avatars + Label chips** — multi-axis (one of each).

All filters compose. e.g. "Overdue + Assigned to me + label=Bug + search 'cron'" works.

### API change
`createTask` now accepts `{ priority, due_date, assignee_id, description }` in addition to title. `listTasks` joins comments/checklist/attachments and computes counts client-side (no extra round trips per card).

---

## 3. Voice-to-text in chat

- New `useSpeechRecognition` hook over the browser's Web Speech API. Free, no key needed, works in Chrome / Edge / Safari (Firefox returns `supported=false` and the button hides).
- New `VoiceInputButton` next to the chat composer:
  - Click → mic glows red and gently pulses while listening (framer-motion opacity loop)
  - Auto-stops on natural pause (default browser behaviour with `continuous=false`)
  - Click again to stop manually
  - Each finalized chunk is appended to the input (preserving any text the user has already typed)
  - Errors (`no-speech`, `aborted`) are silently swallowed; real errors toast
- Composer placeholder updated to "Ask anything… or tap the mic"

---

## Files

New
- `src/features/tasks/components/BoardSmartFilters.jsx` — replaces BoardFilters
- `src/features/assistant/components/VoiceInputButton.jsx`
- `src/features/assistant/hooks/useSpeechRecognition.js`

Updated
- `supabase/functions/chat-assistant/index.ts` — 45 tools total
- `src/features/tasks/api.js` — listTasks counts; createTask signature
- `src/features/tasks/components/TaskCard.jsx` — full rebuild
- `src/features/tasks/components/Column.jsx` — expanded quick-add
- `src/features/tasks/pages/BoardPage.jsx` — search + smart filters + density + new createTask signature
- `src/features/assistant/components/ChatPanel.jsx` — voice button mounted next to composer

---

## Build

`npm run build` — 720 KB JS / 200.6 KB gz, 37.5 KB CSS.

## Verified end-to-end
- chat-assistant E2E (after rate-limit clear): list_customers, get_business_overview, update_project (confirm card), update_customer (confirm card).
- Build succeeds with no warnings about TS-in-JSX (one stray cast removed).
