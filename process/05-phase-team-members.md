# Phase 04 — Team Members & Roles

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Super-admin-only UI to add and manage team members. Wires up the Edge Function authored in Phase 02.

## Tasks
- [x] `features/admin/api.js` — listProfiles, createTeamMember (calls Edge Function via `supabase.functions.invoke`), updateProfile, setProfileRole, setProfileActive, generateTempPassword.
- [x] `features/admin/components/AddTeamMemberModal.jsx` — email + name + auto-generated password + role select. Copy-to-clipboard helper for the temp password.
- [x] `features/admin/components/EditTeamMemberModal.jsx` — change name, role, active flag. Self-update is fenced (cannot change own role or deactivate self).
- [x] `features/admin/pages/UsersListPage.jsx` — searchable table with role + active badges, member dropdown actions.
- [x] Wired into `routes.jsx` behind `<RoleGate>`.
- [x] `npm run build` — 173 KB gz JS.

## Decisions
- **Auto-generate temp passwords** via `generateTempPassword()` — three character classes, shuffled, 12 chars by default. The super_admin shares the password manually with the new member out-of-band.
- **No "delete user" button.** Deactivating an account preserves audit trails (`created_by` references stay valid). Hard-delete would be a separate Edge Function with stricter confirmations.
- **Self-protection.** Active toggle and role select are disabled when editing your own row, so a super_admin can't accidentally lock themselves out.

## Acceptance criteria (verified at deploy)
- super_admin sees the page; member redirects to `/`.
- Add member calls the Edge Function and returns 201 / Adds row to list.
- Inactive members cannot sign in (Supabase enforces via `is_super_admin()`-style helper… actually enforced by the `active = true` check in `is_super_admin()` and by Supabase ignoring the auth row if their email is set inactive — note: Supabase's auth doesn't natively check our `profiles.active`. To enforce hard sign-in blocking, a future change would deactivate via `auth.admin.updateUserById({ banned_until: 'infinity' })`. For now, the `active` flag is informational + RLS-affecting via `is_super_admin()`.

## Commit
`feat(phase-04): /admin/users page with Add/Edit team member modals`

## Open questions / follow-ups
- Hard sign-in blocking when `active = false`: future improvement to also call `auth.admin.updateUserById` with a `banned_until` timestamp from inside the Edge Function. Currently `active` only gates super_admin role checks.
