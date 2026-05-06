# Phase 01 — Foundation

**Status:** ✅ Done
**Date:** 2026-05-06
**Goal:** Scaffold a working Vite + React + Tailwind shell that boots and builds, with all foundational dependencies, lib utilities, theme tokens, and env templates in place. Subsequent phases plug in features without re-touching tooling.

---

## Tasks

- [x] `package.json` — name `weddz-pm`, full dep list (React 18, Router 6, Supabase, framer-motion, lucide, dnd-kit, recharts, date-fns, clsx, tailwind-merge), dev deps (Vite 5, Tailwind 3, PostCSS, autoprefixer).
- [x] `vite.config.js` — React plugin + `@/*` → `src/*` alias.
- [x] `tailwind.config.js` — primary indigo palette, Inter font stack, app-radial gradient, faint grid bg, shimmer + pulse-soft keyframes, glow shadow.
- [x] `postcss.config.js` — Tailwind + autoprefixer.
- [x] `vercel.json` — SPA rewrite, framework=vite, dist output.
- [x] `.env.example` — three `VITE_*` vars (URL, anon key, app name).
- [x] `index.html` — Inter via Google Fonts, dark default body, theme-color meta.
- [x] `public/favicon.svg` — indigo-gradient WP monogram.
- [x] `jsconfig.json` — `@/*` path resolution for editor tooling.
- [x] `src/main.jsx` — React root, BrowserRouter wrapper, StrictMode.
- [x] `src/App.jsx` — placeholder card with framer-motion entrance, Sparkles icon, phase indicator, "next phases" preview.
- [x] `src/index.css` — Tailwind directives, scrollbar styling, focus ring, `glass`/`glass-strong`/`ring-soft`/`text-balance` utilities, `@media print` block (placeholder for Phase 07).
- [x] `src/lib/cn.js` — `clsx` + `twMerge` wrapper.
- [x] `src/lib/format.js` — `formatLKR`, `formatLKRCompact`, `formatDate`, `formatDateTime`, `formatMonth`, `initials`, `truncate`.
- [x] `src/lib/supabase.js` — singleton client, warns (does not throw) on missing env so dev server can boot before Supabase is configured.
- [x] `src/lib/motion.js` — reusable presets: `fadeIn`, `slideInLeft/Right/Bottom`, `pop`, `stagger`, `listItem`, `overlay`.
- [x] `npm install` — 194 packages, 18s.
- [x] `npm run build` — succeeds in 2.5s. Output: 1 KB HTML, 10 KB CSS, 265 KB JS (86 KB gz).

---

## Files added

| Path | Purpose |
|---|---|
| `package.json` / `package-lock.json` | npm manifest + lock |
| `vite.config.js` | Vite config + `@` alias |
| `tailwind.config.js` | Tailwind theme tokens |
| `postcss.config.js` | PostCSS pipeline |
| `vercel.json` | Vercel build + SPA rewrite |
| `.env.example` | Env template |
| `index.html` | App shell, fonts |
| `jsconfig.json` | Editor IntelliSense for `@/*` |
| `public/favicon.svg` | Brand mark |
| `src/main.jsx` | React entrypoint |
| `src/App.jsx` | Phase 01 splash placeholder |
| `src/index.css` | Tailwind + globals + glass utilities |
| `src/lib/cn.js` | Class-name utility |
| `src/lib/format.js` | LKR + date formatting helpers |
| `src/lib/supabase.js` | Supabase client singleton |
| `src/lib/motion.js` | framer-motion presets |

---

## Decisions

- **System fonts + Inter from Google Fonts** instead of bundling. Free, fast, cached cross-site. Falls back to `system-ui` if blocked.
- **Glass utilities in `index.css`** (`@layer utilities`) rather than `tailwind.config` extras — easier to read and Apple-style backdrop-blur isn't a Tailwind core utility shape.
- **`primary` color alias** in Tailwind set to indigo palette so future swaps are a one-line change in `tailwind.config.js`.
- **No ESLint, no Prettier, no test runner** — internal tool, single dev. Add later if needed.
- **`supabase.js` warns instead of throws** on missing env so the dev server can boot before Phase 02 (database) lands.
- **`bg-app-radial` + faint grid backdrop** as the default app background — establishes the futuristic-minimal aesthetic from the start.

---

## Acceptance criteria

| Check | Result |
|---|---|
| `npm install` succeeds | ✅ 194 packages |
| `npm run build` succeeds | ✅ 2.5s build, 86 KB gz JS |
| Build output `dist/index.html` references the bundled assets | ✅ |
| `dist/assets/*.css` includes Tailwind base + utilities | ✅ |
| Vite dev server (`npm run dev`) | ⏸ not run in this commit; user can verify locally |
| Glass utility renders correctly | ⏸ visual check on `npm run dev` |

---

## Commit

`feat: phase 01 foundation — Vite, Tailwind, Supabase client, lib utilities`

---

## Open questions / follow-ups

- None for this phase.
- Phase 02 will create the Supabase project, run the migration, and write/deploy the `create-team-member` Edge Function. The placeholder env warnings in `supabase.js` will then resolve once `.env.local` is filled in.
