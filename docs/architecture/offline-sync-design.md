# Offline and synchronization design

Status: proposed architecture; not implemented. The present web app writes one JSON workspace to `localStorage` and makes best-effort Supabase requests from React effects. That is adequate only for a prototype with noncritical personal records. It has no durable operation queue and cannot safely resolve concurrent edits or offline deletions.

## Target flow

```text
User action
  → validate domain command
  → transactionally save entity + outbox operation to IndexedDB
  → render local state immediately
  → worker sends idempotent operation when online
  → server validates owner, version, and business rules
  → acknowledge operation and update local sync metadata
  → show synced / pending / needs-attention state
```

## Records and idempotency

Use stable UUIDs created once on-device. Store entity `updatedAt`, `revision`, `deletedAt` tombstone, `syncState` and server revision separately from business fields. An outbox operation has an operation UUID, entity type/id, operation kind, base revision, payload, created time, attempt count, and last error. The server keeps an idempotency key unique per user and operation ID. Replaying the same key returns the original result without awarding XP again.

## Retry and conflict policy

Retry network errors, timeouts, rate limits, and transient server failures with capped exponential backoff and jitter. Do not retry permanent validation/auth errors blindly; retain the operation and explain how to fix it. On reconnect, process in creation order per entity while allowing independent entities to sync concurrently.

Use optimistic concurrency (`If-Match`/revision) for updates. Never silently choose local or cloud content when both changed from the same base revision. Offer “keep this device”, “use cloud version”, or a field-level merge for reflection/profile-like text. For sessions and plans, allow an explicit resolution and preserve the losing version in conflict history. Deletion is a tombstone; hard-delete only after server acknowledgement and the retention policy allows it.

## Failure scenarios to cover

- App closes after local transaction but before request: operation remains in IndexedDB.
- Server commits but response is lost: retry uses same operation ID and cannot duplicate the result.
- Refresh during upload: persisted queue resumes.
- User signs out/switches account: partition queue by account; never send one account's records with another token.
- Remote and local edit same entity: revision conflict blocks overwrite pending user choice.
- Delete while offline: tombstone prevents later broad upsert from resurrecting it.
- Schema validation failure: operation stays visible as failed and does not block unrelated records.
- Storage quota failure: reject the action visibly rather than claim it is saved.

## Mobile compatibility

Keep domain validation and `lib/learning-engine.ts` platform-neutral. Put IndexedDB/SQLite, network, auth token, and notification behavior behind repository/platform adapters. Capacitor can use a SQLite-backed store on Android/iOS while sharing entity IDs and operation semantics. Do not start a mobile client before the outbox contract, migrations, and conflict behavior are stable.

## Delivery order

First introduce a repository interface and IndexedDB transaction tests; then durable outbox/idempotent server endpoint; next conflict/tombstone UX and account switching; finally network fault-injection tests and mobile storage adapters. See `docs/implementation-roadmap.md`.
