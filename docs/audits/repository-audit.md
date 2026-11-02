# Repository audit

Audit date: 2026-11-03. Scope: files available under the MENYA workspace, the supplied workbook in Downloads, static source/migration review, Node learning-engine tests, and production build. No live Supabase credentials were present.

## Repository and architecture

The accessible workspace is `/home/gilbert/Documents/Project/menya`. The `.git` entry is an empty/unusable directory in this environment: `git status`, `git branch`, and `git log` fail with “not a git repository”. Commit and branch history therefore cannot be verified here.

The actual application is a React 19 + TypeScript + Vite single-page app. There is no Next.js runtime or `next.config.mjs` in the accessible project. The Next.js mention in the product history is documentation only. No React Router is installed; navigation is a `Page` union and component state in `src/App.tsx`, so pages do not have URLs, deep links, or browser history routing.

```text
index.html                    Vite document shell
src/main.tsx                  React entry point
src/App.tsx                   Views, local state, auth panel, cloud loading/writes
src/style.css                 Handwritten design system and responsive styles
lib/learning-engine.ts        Shared deterministic scoring, summary, and validation logic
lib/supabase.ts               Optional browser Supabase client
supabase/migrations/          PostgreSQL schema and RLS
tests/learning-engine.test.mjs Node built-in calculation/input tests
docs/                         Product, architecture, calculations, and audit records
public/                       App icons and inherited placeholder assets
```

The `app/`, `components/`, and `components/ui/` directories exist but contain no tracked source files in the accessible workspace. No routing, UI/E2E test framework, lint configuration, Tailwind config, or Next/PostCSS config was found. `package-lock.json` is the only lockfile; there is no `pnpm-lock.yaml` in the workspace even though the IDE tab lists one. A Node built-in test suite was added for the calculation layer during this audit.

## Dependencies and configuration

Runtime dependencies used by imports: React, React DOM, Supabase JS, GSAP, and Lucide. `@tanstack/react-query` and `recharts` are installed but no imports were found. `tailwindcss` and `@tailwindcss/vite` are configured, but the current stylesheet is handwritten CSS and contains no Tailwind directives. `@tailwindcss/postcss` was added after the reported Vite error; there is no PostCSS config in this workspace, so that package is not currently used by the app. No dependency was removed during the audit.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are declared. The browser client does not reference a service-role key. Missing either value selects local-only behavior. There are no scripts for linting, browser testing, or migration deployment. `npm run test` now runs the Node built-in test runner without new test dependencies.

## Feature status from source inspection

| Area | Actual state |
|---|---|
| Local session records | Create/edit/delete in React state persisted to `localStorage`; basic validation is shared and tested. No browser interaction/E2E test was run. |
| Topics | Free-text labels and local removal; no subject/module model or topic edit form. Session topic text is a snapshot. |
| Planner | Create/toggle/delete flat planned blocks. No calendar, recurring plan, goal entity, or reschedule flow. Planned time stays outside completed-session analytics. |
| Analytics | Totals and charts derive from saved sessions; daily/weekly UI is limited. No monthly analytics or difficulty comparison screen. |
| Weekly review | Current week metrics and one editable reflection per week in local state; past saved reflections list, but history metrics are not persisted as snapshots. |
| Progression | XP/level/rank/streak/score are recalculated from records. No immutable award ledger or independently granted achievement records. |
| Auth | Optional Supabase sign-up/sign-in/sign-out panel only. No password recovery, route protection, profile-image handling, or security settings. |
| Cloud sync | Per-user reads and broad upserts under RLS, with ad hoc deletes. No durable offline queue, tombstones, conflict UI, or reliable retry. |
| Groups and assistant | Group names remain local notes. Assistant is a transparent rule-based cue, not an AI service. |
| Settings | Display name, targets, scoring values, and appearance; no notification preferences or remote-account deletion. |

Light mode is implemented with partial CSS overrides; full contrast and component coverage have not been verified. The visual gold is `#FFD34A`, which differs from the official `#FFD700`. GSAP is used for a short view reveal and respects reduced-motion CSS, but browser accessibility/performance checks were not run. Placeholder assets remain in `public/` and are not evidence of a finished profile-image flow.

## Verified commands

- `npm test`: 17 Node built-in tests pass.
- `npm audit`: 0 vulnerabilities reported by the configured npm audit registry.
- `npm run build`: TypeScript project build and Vite production bundling pass.
- `npm run typecheck`, lint, responsive browser checks, auth checks, and live database policy tests were not run as part of this audit.

See the other files under `docs/audits/` for calculation, database, and final findings.
