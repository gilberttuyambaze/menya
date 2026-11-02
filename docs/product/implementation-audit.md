# Product and workbook audit

## Starting point

The original workspace was a tiny Next.js dashboard with illustrative hard-coded metrics and a non-persistent quick-log action. The product brief specifies React, TypeScript, and Vite, so the starter was migrated to that stack. The supplied Physics Mission Control workbook has since been inspected and its formulas are documented in `docs/calculations-learning-engine.md`.

## Current web implementation

The application has functioning local workflows for session CRUD and correction history, topic organization, planning, weekly reviews, calculated analytics, progression badges, a rule-based study cue, profile preferences, JSON export, and browser-local persistence. Optional Supabase setup includes email/password auth, owner-scoped RLS tables, and sync for personal topics, sessions, plans, reviews, and append-only session audit events. Group notes remain device-local.

## Implemented rules and deferred product work

- XP, score decay, streaks, levels, ranks, weekly targets, and topic mastery use configurable workbook defaults. Some workbook defaults are explicitly labeled assumptions; see the calculation guide.
- Streaks use the browser's local calendar date. Daily XP is calculated after sessions for a date are combined; historical edits recalculate current progression.
- Mastery labels use aggregate topic accuracy and the configured mastery/developing thresholds. They are derived summaries, not an immutable mastery ledger.
- Achievements derive from current sessions; there is no immutable achievement grant ledger.
- Planned-session reminders and recurring schedules are not implemented.
- The study cue uses a transparent accuracy heuristic; it is not an AI model.

## Remaining production work

1. Provision separate Supabase development and production projects, apply and verify the migration, and configure auth email and redirect policies.
2. Replace the simple background upsert approach with a durable offline outbox, deletion tombstones, retries, idempotency, and a user-visible conflict resolution flow.
3. Add a trusted XP/mastery calculation function, immutable XP corrections, and achievement audit ledger.
4. Implement account export/deletion against remote records, group membership/invitations with explicit share grants, notifications, and an optional secure AI endpoint.
5. Add automated calculation, authorization, synchronization, accessibility, and responsive-browser coverage before release.

## Privacy boundary

When no backend is configured, records stay in this browser. With Supabase configured, authenticated personal rows are protected by RLS. Clearing browser data does not delete remote account records. Group workspaces and notifications are not shared or active in this release.
