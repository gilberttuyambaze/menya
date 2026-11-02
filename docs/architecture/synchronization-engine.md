# Synchronization engine

The app writes locally first. Authenticated mutations create ordered per-entity operations in `sync_outbox`; anonymous mutations remain local. The engine replays pending, retryable failed, or interrupted syncing operations using the same UUID operation ID. Supabase stores each response under `(owner_id, operation_id)`, making uncertain network retries idempotent.

Each write includes its expected server version. The server derives ownership from `auth.uid()`, locks the entity, validates the operation, and either increments its version or returns the current conflicting record. RLS permits users to read only their rows; browsers cannot write the generic record or idempotency tables directly.

Recoverable failures use capped exponential backoff with jitter. Failed operations remain inspectable in IndexedDB; conflicts block later operations for the same entity. The app retries on start and on the browser `online` event. Remote reads are owner-filtered and paginated.

The first implementation currently retrieves pages from the start on each sync. Per-account server cursor persistence and realtime subscriptions are not implemented. Changes occurring after the pull starts are discovered on a later synchronization. Existing normalized Supabase tables remain in place; the migration backfills them into the generic sync table without deleting source rows.
