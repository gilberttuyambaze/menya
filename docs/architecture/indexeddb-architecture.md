# IndexedDB architecture

MENYA keeps each workspace in the browser database `menya-offline`. Schema version 1 has `accounts`, `workspaces`, `sync_outbox`, `sync_metadata`, `conflict_records`, and `deletion_tombstones`. Account keyed records are isolated by authenticated Supabase user UUID; the literal `anonymous` account is never sent to cloud sync.

`workspaces` holds the app's domain-shaped state for compatibility with existing screens. `diffWorkspace` turns a mutation into entity-level session, topic, plan, review, group, settings, and audit changes. A read-write transaction persists the next workspace and all resulting outbox entries together. The browser only reports a successful save after IndexedDB commits.

Legacy localStorage is read once, normalized, saved to IndexedDB, and read back for verification. It is retained as a recovery copy. Signed-in legacy data is marked for reconciliation with cloud metadata before upload. Obvious fixture IDs are filtered; the empty first-run workspace contains no demo history.

IndexedDB is origin-local and subject to browser storage eviction, private browsing restrictions, and device loss. Exported JSON backups and the Supabase account are separate recovery paths. No browser-only design can guarantee durability against a user clearing site data or device failure.
