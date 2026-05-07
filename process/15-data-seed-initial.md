# Change Log 02 — Initial Data Seed

**Date:** 2026-05-07
**Type:** Data seed (post-deploy)
**Affects:** Live Supabase project (`kkxdspommmbjfozxknew`). No code change.
**Author:** wkh0000@gmail.com

---

## What changed

Bulk-loaded the team's real customers, projects, employees, salaries, invoices, and expenses into the live database via the Supabase Management API SQL endpoint and Auth admin endpoint. Done from a one-shot Node script (`process/.seed-initial.mjs`, gitignored — contains the service role key) so the work is auditable without touching client code.

### Team

| Email | Role | Notes |
|---|---|---|
| wkh0000@gmail.com | super_admin | founder (Kasun Wachindra) — linked to "Kasun Wachindra" employee record |
| tharinduinduwara44@gmail.com | **super_admin** | new — linked to "Tharindu Induwara" employee record. Temp password recorded in `process/.credentials.local.md`. Promoted from `member` → `super_admin` on 2026-05-07. |
| test+member@weddz.lk | member | leftover from QA. Can be deactivated via `/admin/users` if you want a clean roster. |

### Employees (HR)

| Name | Title | Type | Base salary | Joined |
|---|---|---|---|---|
| Kasun Wachindra | Founder | Full-time | LKR 110,000 | 2025-01-01 |
| Tharindu Induwara | Engineer | Full-time | LKR 110,000 | 2026-02-01 |

### Customers

`Mr. Saniru`, `Mr. Niroshan`, `Mr. Saman`, `Mr. Pasindu`, `Mrs. Shamali`. Plus `Anjali Perera / Lotus Hospitality` left over from QA.

### Projects

| Project | Customer | Status | Budget | Start | Advance |
|---|---|---|---|---|---|
| Onscene event web | Mr. Saniru | active | LKR 4,950,000 | 2026-03-26 | LKR 500,000 (INV-0001, paid) |
| Nugawela wine stores | Mr. Niroshan (joint w/ Mr. Saniru) | active | LKR 380,000 | 2026-04-20 | LKR 100,000 (INV-0002, paid) |
| Travel quotation system | Mr. Saman | planning | LKR 285,000 | — | — |
| Retail POS | Mr. Pasindu | planning | LKR 45,000 | — | — |
| LMS | Mrs. Shamali | active | LKR 300,000 | 2026-04-26 | LKR 30,000 (INV-0003, paid) |

Each project also got the four default kanban columns inserted (To Do, In Progress, In Review, Done).

### Project-linked expenses

- Onscene: Domain (LKR 5,000), Gemini subscription (LKR 3,500), Quotation print (LKR 1,500)
- Travel: Quotation print (LKR 1,500)
- LMS: Quotation print (LKR 1,500)

### General expenses (April 2026)

- Office rent — April: LKR 20,000
- Electricity — April: LKR 7,500
- Water — April: LKR 2,000
- Internet — April: LKR 5,000

### Salaries (all paid, all auto-rolled into expenses)

| Employee | Period | Net | Paid on |
|---|---|---|---|
| Tharindu Induwara | 2026-03 | LKR 110,000 | 2026-04-01 |
| Tharindu Induwara | 2026-04 | LKR 110,000 | 2026-05-01 |
| Kasun Wachindra | 2026-04 | LKR 110,000 | 2026-05-01 |

Each row inserts both the salary record and the corresponding `Salary` expense row linked via `salary_id`. Same shape `pay_salary()` produces — done directly because the seed runs as DB superuser, not as an authenticated user, and `pay_salary` enforces `is_super_admin()` which evaluates against `auth.uid()`.

---

## How

`process/.seed-initial.mjs` (gitignored) does:

1. Calls `POST https://{ref}.supabase.co/auth/v1/admin/users` with the service role key to create Tharindu's auth user with `email_confirm: true` (skip verification email).
2. Runs a single `DO $$ … END $$` block via `POST https://api.supabase.com/v1/projects/{ref}/database/query`. Inside the block: declares uuid variables, inserts everything in dependency order (employees → customers → projects → columns → invoices+items → salaries → expenses), and uses `RETURNING id INTO v_*` to chain references.
3. Runs an aggregate `SELECT` to print the row counts.

Verification ran via `process/.verify-seed.mjs` (also gitignored). Output (abridged):

```
Onscene event web        budget 4,950,000   paid 500,000   exp 10,000
Nugawela wine stores     budget   380,000   paid 100,000   exp      0
Travel quotation system  budget   285,000   paid       0   exp  1,500
Retail POS               budget    45,000   paid       0   exp      0
LMS                      budget   300,000   paid  30,000   exp  1,500

General total: 34,500     Salary expenses total: 330,000
INV-0001 INV-0002 INV-0003 — all paid
3 salaries — all paid
3 profiles — founder + Test Member (QA leftover) + Tharindu
```

---

## Open follow-ups

- Old QA leftovers in DB:
  - Customer `Anjali Perera / Lotus Hospitality`
  - Project `Lotus Reservations CRM`
  - Profile `test+member@weddz.lk`
  - Task "Initial product brief from Anjali" inside Lotus board

  All can be deleted via the UI when you want a clean dataset.

- The two seed scripts (`process/.seed-initial.mjs`, `process/.verify-seed.mjs`) are gitignored — they hold the service role key. They sit in your local `process/` folder if you ever want to re-run or reference them.
