# Conflict resolution

Version mismatch returns both the local operation base and the current cloud entity. `mergeDisjointChanges` performs a three-way recursive object merge; arrays and scalar fields are atomic. Independent object-field edits can be rebased automatically. Concurrent edits to the same field, record create collisions, and delete-versus-edit are recorded as conflicts and block that entity.

Conflict records preserve base, local, cloud payloads, the cloud version, and conflicting paths. Choosing cloud supersedes local pending operations and applies the cloud entity. Choosing local/merged creates a new operation against the observed cloud version; it never reuses a stale expected version. Resolution uses explicit user selection rather than timestamps.

Settings exposes each unresolved conflict, the compared payloads, conflicting field paths, and explicit keep-device / keep-cloud actions. Recovery operations are requeued against the observed cloud version. Automatic merge and RPC behavior have not been verified against a live Supabase project.
