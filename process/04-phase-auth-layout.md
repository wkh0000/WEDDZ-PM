# Phase 03 — Auth + Layout

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Establish the authenticated app shell — context providers, route guards, sidebar/topbar, login/signup/forgot-password pages, full UI primitive library, and routes wired to placeholder pages.

---

## Tasks

- [x] AuthContext — session + profile (with role) + signIn/signUp/signOut/sendPasswordReset/updateOwnProfile/refreshProfile
- [x] ToastContext — top-right stack with framer-motion enter/exit, auto-dismiss
- [x] ProtectedRoute — gates by `isAuthed`; spinner while loading
- [x] RoleGate — gates by role; redirects + toasts on insufficient access
- [x] AppShell — sidebar (desktop) + drawer (mobile) + topbar + outlet with route-change AnimatePresence
- [x] Sidebar — role-aware nav (hides Employees + Team Members for `member` role), active-pill spring animation, mobile-friendly
- [x] Topbar — profile dropdown, Sign Out, super-admin badge, mobile menu button
- [x] PageHeader — h1, description, actions slot, breadcrumb slot
- [x] LoginPage, SignupPage, ForgotPasswordPage with shared AuthLayout
- [x] UI primitives: Button, Input, Textarea, Select, Card, Badge, Avatar, EmptyState, Modal, Drawer, ConfirmDialog, Spinner, StatCard, Tabs, DropdownMenu, Table
- [x] Hooks: useDisclosure, useDebounce
- [x] ComingSoon placeholder + NotFoundPage
- [x] routes.jsx — every route wired (placeholders for unbuilt phases)
- [x] main.jsx — wraps with BrowserRouter > ToastProvider > AuthProvider
- [x] `npm run build` succeeds — 547 KB JS / 162 KB gz, 26 KB CSS / 5.6 KB gz

---

## Files added

UI primitives (`src/components/ui/`):
- Button, Input, Textarea, Select, Card, Badge, Avatar, EmptyState, Modal, Drawer, ConfirmDialog, Spinner, StatCard, Tabs, DropdownMenu, Table

Layout (`src/components/layout/`):
- AppShell, Sidebar, Topbar, PageHeader

Gates + page chrome:
- `src/components/ProtectedRoute.jsx`
- `src/components/RoleGate.jsx`
- `src/components/ComingSoon.jsx`
- `src/components/NotFoundPage.jsx`

Auth feature (`src/features/auth/pages/`):
- AuthLayout, LoginPage, SignupPage, ForgotPasswordPage

Context:
- `src/context/AuthContext.jsx`
- `src/context/ToastContext.jsx`

Hooks (`src/hooks/`):
- useDisclosure, useDebounce

Top-level:
- `src/routes.jsx` — full route tree, RoleGate-wrapped admin/HR routes
- `src/main.jsx` updated to wrap providers
- `src/App.jsx` simplified to `<AppRoutes />`

---

## Decisions

- **One `AuthContext` exposes both `session` and `profile`** so consumers don't have to fetch the profile separately. `loadProfile` is called on init and on every `auth.onAuthStateChange`.
- **Active nav uses `motion.span` with `layoutId`** — the indicator pill smoothly slides between active routes (Framer's shared-layout magic).
- **`RoleGate` is composable over routes**, not baked into `ProtectedRoute`. Cleaner: `ProtectedRoute` says "logged in"; `RoleGate` says "has the right role." Some routes need only the first, some need both.
- **`AuthLayout` is shared by all auth pages** — single source of brand styling for the auth flow.
- **`ComingSoon` placeholder is a PageHeader + framer-motion card** — the whole app navigates and feels alive even before features are filled in. Acceptance for later phases is "replace this placeholder with the real page."
- **Toast queue uses framer-motion `layout` + `AnimatePresence`** — toasts slide and reflow when others dismiss.
- **Print CSS placeholder already in `index.css`** — the Phase 07 invoice print view will hook in via `.no-print` class.

---

## Acceptance criteria (logic — actual data verified at deploy time)

| Check | Status |
|---|---|
| `npm run build` succeeds | ✅ |
| All routes resolve to a real component | ✅ (ComingSoon for unbuilt) |
| Authenticated routes render `<AppShell>` | ✅ |
| Member-only sidebar hides Employees + Team Members | ✅ (logic; verified manually post-deploy) |
| Logging out from Topbar redirects to /login | ✅ (logic) |
| Modal/Drawer Esc-close + scroll-lock | ✅ (logic; verified during component QA) |

---

## Commit

`feat(phase-03): auth context, layout, route guards, UI primitives, placeholder routes`

---

## Open questions / follow-ups

- Account page (`/account`) is a Phase 13 placeholder — full self-service profile edit lives there.
- Future polish: add the Inter `font-display: swap` flash mitigation if the network is slow (low priority).
