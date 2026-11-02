# MENYA web foundation

## Stack and layout

React 19, TypeScript, and Vite power the responsive web application. `src/App.tsx` contains the first complete product workflow; the deterministic calculations live in `lib/learning-engine.ts`. Supabase JS is initialized only when Vite environment variables are present. The app supports reduced motion and a light appearance option.

## Implemented workflows

- Mission Control with metrics derived from study records.
- Topic creation and topic-level practice accuracy.
- Study-session create, edit, delete, historical date correction, and a local/remote correction log.
- Planned sessions with separate planned and completed minutes.
- Weekly reflections with calculated summaries.
- Analytics, progression badges, a rule-based study cue, appearance/profile preferences, and JSON export.
- Supabase email/password sign-up and sign-in when configured.
- Per-user Supabase data loading and writes for profiles, topics, sessions, planner entries, reviews, and append-only audit events. Group notes remain local.

## Storage and synchronization boundary

Without Supabase configuration, MENYA stores the workspace in browser `localStorage`. With Supabase configured and an authenticated account, user-owned records are stored locally and upserted to the remote schema under RLS. The Supabase auth client keeps its session in browser storage. Online edits persist after the app reconnects, but the current sync is not a durable offline outbox: it has no conflict review, retry queue, or tombstone model. When data is present remotely, the last local copy for a matching record ID takes precedence on merge. Avoid using this MVP for critical records until synchronization conflicts are addressed.

Clearing browser data clears only this device's cache. It does not delete the account or remote Supabase records. Group notes are not shared or synced. The browser key must be the public anon key; never expose a service-role key through a `VITE_` variable.

## Calculations

`lib/learning-engine.ts` implements the supplied Physics Mission Control workbook's configurable defaults. Dates use the browser's local calendar. Sessions on each date are aggregated before daily accuracy and XP are calculated. The engine handles pending current days, missed-day score decay, weekly targets, levels, ranks, and topic mastery. It calculates history dynamically rather than keeping the workbook's 365-day limit. Historical edits recalculate current summaries; append-only audit entries retain the prior session snapshot. See [the calculation guide](../calculations-learning-engine.md) for formulas and workbook assumptions.

The current app recalculates progression in the browser from session records. A production multi-device scoring ledger should move authoritative XP awards and correction transactions behind a trusted database function or Edge Function; browser clients must not write to a privileged XP ledger.

## Run and deploy

1. Run `npm install` and `npm run dev`.
2. To connect Supabase, copy `.env.example` to `.env.local`, add the project URL and anon key, then restart Vite.
3. Apply `supabase/migrations` with the Supabase CLI against a development project first.
4. Run `npm run build`; deploy `dist/` as a Vite SPA with a fallback to `/index.html` for app routes.
5. Keep preview and production Supabase projects separate and apply reviewed migrations through deployment automation.

## Mobile path

The shared calculation module and web UI provide a path toward Capacitor. Before mobile release, move offline records to IndexedDB/native storage behind a repository interface, add an idempotent outbox and conflict handling, then implement platform notification and background-sync adapters. The current `localStorage` sync is not a mobile-ready offline system.
