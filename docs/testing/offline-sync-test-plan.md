# Offline sync test plan

Automated tests use fake IndexedDB and deterministic transport stubs to cover local creation, restart persistence, offline queueing, transaction atomicity, retries/backoff, repeated operation IDs, successful sync, stale-version conflicts, user-selected resolution, deletion tombstones, owner isolation, migration preservation, interrupted request replay, and XP recalculation from corrected source sessions.

Transport unit tests cannot establish Postgres locking, RLS enforcement, concurrent multi-device behavior, or authenticated user isolation. Those require a disposable Supabase integration project with two authenticated users and concurrent RPC calls. No live credentials are configured in this workspace, so database behavior remains unverified until that suite runs.

Run `npm test`, `npm run typecheck`, and `npm run build`. Also manually test airplane mode, refresh/reopen, reconnect, account switching, localStorage migration, and browser storage failure. Verify that an unsynced DELETE remains represented by a tombstone and that an unresolved conflict is visible and recoverable.
