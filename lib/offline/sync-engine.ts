import type { IndexedDbLearningRepository } from './indexeddb-repository'
import type { EntityChange, OutboxOperation, ServerEntity, SyncState } from './types'
import { mergeDisjointChanges } from './conflict-merge.ts'

export type ApplyResult = { ok: true; version: number; updatedAt: string } | { ok: false; conflict: ServerEntity }
export interface SyncTransport {
  apply(operation: OutboxOperation): Promise<ApplyResult>
  listPage(after: string | null, limit: number): Promise<{ rows: ServerEntity[]; cursor: string | null }>
}
export type SyncOptions = { now?: () => number; random?: () => number; maxRetries?: number; pageSize?: number; onState?: (state: SyncState) => void }

export async function synchronize<T extends object>(args: {
  ownerId: string
  repository: IndexedDbLearningRepository<T>
  transport: SyncTransport
  applyRemote: (data: T, entity: ServerEntity) => T
  currentLocalVersion: () => Promise<number>
  legacy?: { empty: T; diff: (before: T, after: T) => EntityChange[] }
  options?: SyncOptions
}) {
  const { ownerId, repository, transport, applyRemote, currentLocalVersion } = args
  const options = args.options ?? {}
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const retryLimit = options.maxRetries ?? 8
  const emit = (state: SyncState) => options.onState?.(state)
  if (ownerId === 'anonymous') return { state: 'synced' as SyncState, processed: 0 }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { emit('offline'); return { state: 'offline' as SyncState, processed: 0 } }
  emit('syncing')
  let processed = 0
  // A prior request may have reached the server before the app stopped. Replaying
  // its operation ID is safe because the server stores its response idempotently.
  const allOperations = await repository.listOutbox(ownerId)
  const queue = allOperations.filter((op) => op.status === 'pending' || op.status === 'failed' || op.status === 'syncing')
  const blocked = new Set(allOperations.filter((op) => op.status === 'conflict').map((op) => `${op.entityType}:${op.entityId}`))
  for (const op of queue) {
    if (op.ownerId !== ownerId || blocked.has(`${op.entityType}:${op.entityId}`)) continue
    if (op.status === 'failed' && op.retryCount >= retryLimit) { blocked.add(`${op.entityType}:${op.entityId}`); continue }
    if (op.nextRetryAt > now()) { blocked.add(`${op.entityType}:${op.entityId}`); continue }
    try {
      await repository.markSyncing(op)
      const result = await transport.apply(op)
      if (!result.ok) {
        const workspaceVersion = await currentLocalVersion()
        const merged = mergeDisjointChanges(op.basePayload, op.payload, result.conflict.payload)
        if (!result.conflict.deletedAt && merged.merged && merged.conflictingPaths.length === 0) {
          await repository.saveConflict(op, result.conflict, merged.merged, [], workspaceVersion)
          await repository.resolveConflict(ownerId, `${ownerId}:${op.entityType}:${op.entityId}`, 'local', merged.merged, applyRemote)
        } else {
          await repository.saveConflict(op, result.conflict, op.payload, merged.conflictingPaths.length ? merged.conflictingPaths : ['record'], workspaceVersion)
          blocked.add(`${op.entityType}:${op.entityId}`)
        }
        processed++
        continue
      }
      await repository.acknowledge(op, result.version, result.updatedAt)
      processed++
    } catch (error) {
      const retryCount = op.retryCount + 1
      const delay = Math.min(60_000 * 2 ** Math.max(0, retryCount - 1), 6 * 60 * 60_000)
      await repository.markFailed(op, error instanceof Error ? error.message : 'Network request failed.', now() + Math.round(delay * (0.75 + random() * 0.5)), retryCount)
      blocked.add(`${op.entityType}:${op.entityId}`)
    }
  }
  let cursor: string | null = null
  const pageSize = options.pageSize ?? 200
  do {
    const page = await transport.listPage(cursor, pageSize)
    for (const entity of page.rows) await repository.applyRemote(ownerId, entity, applyRemote)
    cursor = page.cursor
  } while (cursor)
  if (args.legacy) await repository.finishLegacyReconciliation(ownerId, args.legacy.empty, args.legacy.diff, applyRemote)
  const state = (await repository.getSyncState(ownerId)).state as SyncState
  emit(state)
  return { state, processed }
}
