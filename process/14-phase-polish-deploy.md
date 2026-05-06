# Phase 13 — Polish + Deploy

**Status:** ✅ Done (live)
**Date:** 2026-05-06
**Goal:** Ship a working build to production: code polish, Supabase + Vercel + GitHub deploy, end-to-end QA on the live URL, plus all bug fixes that QA surfaced.

## Sub-phases

### 13a — Code polish ✅
- React.lazy + Suspense for `BoardPage` and `InsightsPage`. Main bundle dropped from 220 KB gz to 196 KB gz; the heavy chunks load on demand.
- `/account` page: edit display name + change password (`supabase.auth.updateUser`).
- ErrorBoundary at the React root with a glass-styled fallback.

### 13b — Supabase setup ✅
- Generated a Supabase Personal Access Token via dashboard (saved to `process/.credentials.local.md`, gitignored).
- Created project `weddz-pm` in `ap-southeast-1` (Singapore). Project ref: `kkxdspommmbjfozxknew`.
- Linked locally; bumped `config.toml` major_version to 17 to match the cloud project.
- Pushed all three migrations: `001_initial_schema`, `002_storage_policies`, `003_storage_buckets`.
- Buckets created: `task-attachments` (10 MB cap), `invoice-receipts` (10 MB), `employee-photos` (5 MB) — all private.
- Edge Function `create-team-member` deployed (113.4 KB) with `--no-verify-jwt` (we verify the caller's super_admin role manually inside).
- `SUPABASE_SERVICE_ROLE_KEY` is auto-injected into Edge Functions by the runtime — no manual `secrets set` needed (CLI even refuses to set `SUPABASE_*` env names).
- Disabled email confirmation via Management API (`mailer_autoconfirm: true`) so signups complete instantly.
- Updated `site_url` and `uri_allow_list` to include the prod URL.

### 13c — GitHub repo + push ✅
- Initial create on `Captain-Fellow/weddz-pm` failed because Vercel was connected to the `wkh0000` GitHub account.
- Switched gh active account to `wkh0000`, redirected the local remote to the empty `wkh0000/WEDDZ-PM` repo the user had pre-created, force-pushed clean history.
- Captain-Fellow/weddz-pm cleanup pending (needs `delete_repo` scope; non-blocking).

### 13d — Vercel deploy ✅
- Imported `wkh0000/WEDDZ-PM` into Vercel via the New Project flow (browser-driven).
- Set three env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`.
- Production URL: **https://weddz-pm.vercel.app**.
- Auto-deploy on every push to `master` confirmed working.

### 13e — End-to-end QA + fixes ✅
Verified flows on the production URL with the founder login (`wkh0000@gmail.com`):

| Flow | Result |
|---|---|
| Sign up first user | ✅ trigger promotes to `super_admin`, lands on dashboard |
| Hard refresh on protected route | ✅ session restores, profile loads, full sidebar shows |
| Customer create | ✅ "Anjali Perera / Lotus Hospitality" added |
| Project create | ✅ "Lotus Reservations CRM" linked to the customer |
| Default kanban columns on project create | ✅ "0 tasks across 4 columns" — all four (To Do / In Progress / In Review / Done) inserted |
| Project detail tabs + financials | ✅ |
| Edge Function (`/admin/users`) reachable | ✅ — page lists the founder, Add modal works |
| Dashboard stat cards | ✅ visible after fix |
| Build size | ✅ 196 KB gz main + 27 KB gz BoardPage chunk + 109 KB gz InsightsPage chunk |

**Bugs found & fixed during QA** (all committed):

1. **`AuthContext` deadlock on hard refresh** — Supabase JS holds an internal mutex during `onAuthStateChange`; awaiting any other Supabase call inside that callback deadlocks. Fixed by splitting profile load into a separate effect that watches `session`. (`959f1d2`, `0b7ceb3`)
2. **Stat cards stuck at opacity 0.34** — nested `motion.div` variants on the dashboard fought the `StatCard`'s own animation. Removed the wrapping variant container. (`de013f3`)
3. **PageHeader + most page wrappers stuck mid-animation** — same nested-motion issue across all feature pages. Removed page-level motion entrance wrappers everywhere; the AppShell route transition is the only entrance now. (`89eb72f`)

## Decisions
- **Active GitHub account: `wkh0000`** (Vercel was already connected to it; the user pre-created an empty `wkh0000/WEDDZ-PM` repo).
- **Repo visibility: public** (the user chose this when creating the empty repo).
- **Two Vercel projects pointed at the same repo** (`weddz-pm` from my import + `project-sjgne` from the user's import). The `weddz-pm` one is canonical and serves https://weddz-pm.vercel.app/. The other can be deleted by the user.
- **`mailer_autoconfirm` set via Management API** instead of the dashboard so the deploy is fully scriptable.
- **No page-level motion entrances** — relied solely on AppShell's route transition. Avoids the framer-motion variant-nesting bug that surfaces on slow renders / re-renders triggered by realtime + auth.

## Open follow-ups (low priority)
- Disable public signup in Supabase Auth settings now that the founder is bootstrapped (one-click in dashboard). Not done in deploy because we need it for adding more team members in QA — but recommend toggling off after the team is set up.
- Hard sign-in blocking when `profiles.active=false` would require updating the Edge Function to also call `auth.admin.updateUserById({ banned_until: ... })`. Currently `active` is informational + role-affecting via `is_super_admin()` only.
- Delete the orphan `Captain-Fellow/weddz-pm` repo (needs `delete_repo` scope refresh on gh CLI, or the user can delete it from github.com).
- The `project-sjgne` Vercel project can be removed.

## Commits in this phase
- `caefc86 feat(phase-13): code-splitting, account page, error boundary`
- `17bbfc8 feat(phase-13b): Supabase live — migration 003 + supabase CLI dep`
- `959f1d2 fix(phase-13): AuthContext deadlock on hard refresh`
- `0b7ceb3 fix(phase-13): split profile load out of onAuthStateChange to avoid auth-lock deadlock`
- `de013f3 fix(phase-13): drop framer-motion variant nesting that left stat cards stuck mid-animation`
- `89eb72f fix(phase-13): purge page-level motion entrance wrappers that left content stuck mid-animation`
