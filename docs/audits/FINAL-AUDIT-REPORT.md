# Final audit report

Audit date: 2026-11-03. This is a repository and code audit, not a production certification. Source files, one supplied workbook, local automated calculation tests, dependency resolution, TypeScript, and a Vite build were checked.

## 1. Overall project status

MENYA is a working React/TypeScript/Vite web MVP with a functional local learning workspace and optional Supabase integration in source. It is not production-ready for durable multi-device records, authoritative scoring, collaboration, or mobile distribution. Git branch/history could not be checked because the workspace's `.git` entry is not a usable Git repository in this environment.

## 2. Verified working features

- 17 learning-engine/input-validation tests pass, including the workbook's reference XP example, daily aggregation, score decay, streaks, weekly targets/status, mastery, duplicate IDs, historical recalculation, dates, and invalid counts/durations.
- Local session/topic/planner/review/setting flows are present in the source and use browser storage. They were not exercised in a browser or end-to-end test.
- Metrics are calculated from recorded data; no hardcoded production analytics were found in the inspected dashboard calculations.
- TypeScript check, dependency tree check, and Vite production build pass (exact commands below).
- Migration statically enables RLS and has owner policies on user-owned rows. No live policies were exercised.

## 3. Critical issues and limitations

- The Supabase sync merge gives local records precedence and has no durable outbox, revision checks, tombstones, or conflict resolution. Stale data and deletion resurrection are possible.
- The database does not enforce that an optional session `topic_id` belongs to the same user. The current UI does not populate that column; enforce tenant integrity before it is used.
- Progression is recalculated client-side; the XP table is not integrated into award/correction operations. Do not treat displayed progression as tamper-resistant.
- No password recovery, route-level auth guard, server-backed account deletion/export, full subject/module model, full calculated weekly history, monthly analytics, real groups, reminders, or AI endpoint exists.
- No browser accessibility, visual, responsive, two-account authorization, offline recovery, or live Supabase tests were run. No lint script/config exists.
- `npm audit` reported 0 vulnerabilities. Two installed direct dependencies (`@tanstack/react-query`, `recharts`) have no discovered imports; Tailwind PostCSS is installed to match the reported config error, but no PostCSS config exists in the accessible workspace.

## 4. Workbook verification

The workbook was found at `/home/gilbert/Downloads/Physics_Mission_Control.xlsx`; its six expected sheets were inspected. Core daily XP, active-day, pending/current-day streak, missed-day decay, rank/level, topic mastery, and weekly target/status behavior match the app after this audit's fixes. `docs/audits/learning-engine-audit.md` records rule-by-rule comparisons and explicit assumptions. Four defaults (180 weekly minutes, 80% mastery, 60% developing, 100 XP/level) are labeled assumptions in the workbook. The app intentionally expands the workbook's 365-day/500-session/15-topic limits.

## 5. Database and security

RLS/ownership policies and public-key-only frontend config passed static inspection. No Supabase credentials were available, so migrations, grants, auth policies, data isolation, storage, and recovery remain unverified live. A schema fallback mismatch (`Moderate` default excluded by its check constraint) was fixed in the base migration and a forward migration; neither migration has been applied to any project.

## 6. Build and tests

- `npm test` — passed, 17 tests.
- `npm run typecheck` — passed.
- `npm ls --depth=0` — passed; installed dependencies resolve.
- `npm audit` — passed; 0 vulnerabilities reported.
- `npm run build` — passed; TypeScript build and Vite bundle completed.
- `npm run lint` — not configured.
- Supabase/RLS/browser/E2E tests — not run.

## 7. Changes made

- Added shared form validation that enforces date, topic length, duration, and problem-count boundaries.
- Made summary/mastery calculations ignore duplicate session IDs, using the last value as the winning synchronized version.
- Added `summarizeWeek` with workbook-compatible completed-empty-week MISSED behavior and wired it into Weekly Review.
- Added 17 engine tests and an `npm test` script.
- Corrected the SQL difficulty fallback and added a forward migration for existing installations.
- Added repository, workbook, database/security, offline design, implementation roadmap, and final audit documents under `docs/audits/`, `docs/architecture/`, and `docs/`.

## 8. Recommended next work

Priority is in `docs/implementation-roadmap.md`. First, build the durable IndexedDB repository/outbox with account isolation, operation idempotency, tombstones, and visible conflict resolution. Then validate RLS and tenant relationships against a disposable Supabase project. Keep authoritative XP ledger work before any competitive/redeemable progression.
