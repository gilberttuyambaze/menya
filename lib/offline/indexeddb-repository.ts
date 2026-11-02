import type {
  DeletionTombstone,
  EntityChange,
  EntityType,
  OutboxOperation,
  ServerEntity,
  SyncConflict,
  SyncMetadata,
  WorkspaceRecord,
} from './types'

const DATABASE_NAME = 'menya-offline'
const DATABASE_VERSION = 1
const OWNER_INDEX = 'by-owner'
const OWNER_CREATED_INDEX = 'by-owner-created'

export class LocalVersionConflictError extends Error {
  constructor() {
    super('This workspace changed in another tab. Reload it before saving more changes.')
    this.name = 'LocalVersionConflictError'
  }
}

export class IndexedDbLearningRepository<T extends object> {
  private databasePromise: Promise<IDBDatabase> | null = null

  async open() {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is not available in this browser.')
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('accounts')) database.createObjectStore('accounts', { keyPath: 'ownerId' })
          if (!database.objectStoreNames.contains('workspaces')) database.createObjectStore('workspaces', { keyPath: 'ownerId' })
          if (!database.objectStoreNames.contains('sync_outbox')) {
            const store = database.createObjectStore('sync_outbox', { keyPath: 'operationId' })
            store.createIndex(OWNER_INDEX, 'ownerId')
            store.createIndex(OWNER_CREATED_INDEX, ['ownerId', 'createdAt'])
          }
          if (!database.objectStoreNames.contains('sync_metadata')) {
            const store = database.createObjectStore('sync_metadata', { keyPath: 'key' })
            store.createIndex(OWNER_INDEX, 'ownerId')
          }
          if (!database.objectStoreNames.contains('conflict_records')) {
            const store = database.createObjectStore('conflict_records', { keyPath: 'conflictId' })
            store.createIndex(OWNER_INDEX, 'ownerId')
          }
          if (!database.objectStoreNames.contains('deletion_tombstones')) {
            const store = database.createObjectStore('deletion_tombstones', { keyPath: 'tombstoneId' })
            store.createIndex(OWNER_INDEX, 'ownerId')
          }
        }
        request.onsuccess = () => {
          const database = request.result
          database.onversionchange = () => database.close()
          resolve(database)
        }
        request.onerror = () => reject(request.error ?? new Error('Could not open local learning storage.'))
        request.onblocked = () => reject(new Error('Close other MENYA tabs to finish a local storage upgrade.'))
      })
    }
    return this.databasePromise
  }

  async loadOrMigrate(ownerId: string, fallback: T, legacyKey: string, storage: Pick<Storage, 'getItem'> | undefined, sanitize: (data: unknown) => T): Promise<WorkspaceRecord<T>> {
    const database = await this.open()
    const transaction = database.transaction(['accounts', 'workspaces'], 'readwrite')
    const done = transactionDone(transaction)
    const workspaces = transaction.objectStore('workspaces')
    const existing = await requestResult(workspaces.get(ownerId)) as WorkspaceRecord<T> | undefined
    if (existing) {
      await done
      return existing
    }

    const raw = storage?.getItem(legacyKey) ?? null
    let data = fallback
    let migratedLegacy = false
    if (raw) {
      try { data = sanitize(JSON.parse(raw)); migratedLegacy = true } catch { data = fallback }
    }
    const record: WorkspaceRecord<T> = {
      ownerId,
      data,
      localVersion: 1,
      updatedAt: new Date().toISOString(),
      needsReconciliation: migratedLegacy && ownerId !== 'anonymous',
    }
    transaction.objectStore('accounts').put({ ownerId, lastOpenedAt: record.updatedAt })
    workspaces.add(record)
    try { await done } catch (error) {
      // Another tab may have initialized this account first. Its committed copy
      // wins; do not replace it with a second migration snapshot.
      const winner = await this.getWorkspace(ownerId)
      if (winner) return winner
      throw error
    }

    // Verify the durable copy before callers use it. Legacy localStorage remains untouched.
    const verified = await this.getWorkspace(ownerId)
    if (!verified || JSON.stringify(verified.data) !== JSON.stringify(data)) throw new Error('Local migration verification failed; the original browser data was preserved.')
    return verified
  }

  async getWorkspace(ownerId: string): Promise<WorkspaceRecord<T> | undefined> {
    const database = await this.open()
    const transaction = database.transaction('workspaces', 'readonly')
    const result = await requestResult(transaction.objectStore('workspaces').get(ownerId)) as WorkspaceRecord<T> | undefined
    await transactionDone(transaction)
    return result
  }

  async commitWorkspace(ownerId: string, data: T, expectedLocalVersion: number, changes: EntityChange[], enqueue: boolean): Promise<WorkspaceRecord<T>> {
    const database = await this.open()
    const stores = ['accounts', 'workspaces', 'sync_metadata', 'sync_outbox', 'deletion_tombstones']
    const transaction = database.transaction(stores, 'readwrite')
    const done = transactionDone(transaction)
    const workspaceStore = transaction.objectStore('workspaces')
    const current = await requestResult(workspaceStore.get(ownerId)) as WorkspaceRecord<T> | undefined
    if (!current || current.localVersion !== expectedLocalVersion) {
      transaction.abort()
      try { await done } catch { /* transaction is intentionally aborted */ }
      throw new LocalVersionConflictError()
    }
    const [metadataRows, outboxRows] = await Promise.all([
      requestResult(transaction.objectStore('sync_metadata').index(OWNER_INDEX).getAll(ownerId)) as Promise<SyncMetadata[]>,
      requestResult(transaction.objectStore('sync_outbox').index(OWNER_INDEX).getAll(ownerId)) as Promise<OutboxOperation[]>,
    ])
    const metadataByKey = new Map(metadataRows.map((item) => [metadataKey(item.entityType, item.entityId), item]))
    const record: WorkspaceRecord<T> = { ...current, data, localVersion: current.localVersion + 1, updatedAt: new Date().toISOString() }
    workspaceStore.put(record)
    transaction.objectStore('accounts').put({ ownerId, lastOpenedAt: record.updatedAt })

    if (enqueue) {
      for (const change of changes) {
        const chain = outboxRows.filter((item) => item.entityType === change.entityType && item.entityId === change.entityId && isUnfinished(item.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const tail = chain.at(-1)
        const metadata = metadataByKey.get(metadataKey(change.entityType, change.entityId))
        const operation: OutboxOperation = {
          operationId: crypto.randomUUID(), ownerId, entityType: change.entityType, entityId: change.entityId,
          operationType: change.operationType, payload: change.payload,
          basePayload: tail ? tail.payload : metadata?.payload ?? null,
          baseServerVersion: tail ? tail.baseServerVersion + 1 : metadata?.serverVersion ?? 0,
          createdAt: new Date().toISOString(), retryCount: 0, nextRetryAt: 0, status: 'pending',
        }
        transaction.objectStore('sync_outbox').add(operation)
        outboxRows.push(operation)
        if (operation.operationType === 'DELETE') {
          const tombstone: DeletionTombstone = { tombstoneId: `${ownerId}:${change.entityType}:${change.entityId}`, ownerId, entityType: change.entityType, entityId: change.entityId, operationId: operation.operationId, createdAt: operation.createdAt }
          transaction.objectStore('deletion_tombstones').put(tombstone)
        }
      }
    }
    await done
    return record
  }

  async listOutbox(ownerId: string): Promise<OutboxOperation[]> {
    const database = await this.open()
    const transaction = database.transaction('sync_outbox', 'readonly')
    const rows = await requestResult(transaction.objectStore('sync_outbox').index(OWNER_INDEX).getAll(ownerId)) as OutboxOperation[]
    await transactionDone(transaction)
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId) || a.baseServerVersion - b.baseServerVersion || a.operationId.localeCompare(b.operationId))
  }

  async listConflicts(ownerId: string): Promise<SyncConflict[]> {
    const database = await this.open()
    const transaction = database.transaction('conflict_records', 'readonly')
    const rows = await requestResult(transaction.objectStore('conflict_records').index(OWNER_INDEX).getAll(ownerId)) as SyncConflict[]
    await transactionDone(transaction)
    return rows.filter((item) => !item.resolvedAt)
  }

  async getMetadata(ownerId: string, type: EntityType, id: string): Promise<SyncMetadata | undefined> {
    const database = await this.open()
    const transaction = database.transaction('sync_metadata', 'readonly')
    const result = await requestResult(transaction.objectStore('sync_metadata').get(`${ownerId}:${metadataKey(type, id)}`)) as SyncMetadata | undefined
    await transactionDone(transaction)
    return result
  }

  async markSyncing(operation: OutboxOperation) {
    return this.updateOperation(operation.operationId, { status: 'syncing', startedAt: Date.now(), lastError: undefined })
  }

  async markFailed(operation: OutboxOperation, error: string, retryAt: number, retryCount: number) {
    return this.updateOperation(operation.operationId, { status: 'failed', startedAt: undefined, lastError: error, nextRetryAt: retryAt, retryCount })
  }

  async acknowledge(operation: OutboxOperation, version: number, updatedAt: string) {
    const database = await this.open()
    const transaction = database.transaction(['sync_outbox', 'sync_metadata', 'deletion_tombstones'], 'readwrite')
    const done = transactionDone(transaction)
    transaction.objectStore('sync_outbox').put({ ...operation, status: 'synced', startedAt: undefined, lastError: undefined })
    const metadata: SyncMetadata = { key: `${operation.ownerId}:${metadataKey(operation.entityType, operation.entityId)}`, ownerId: operation.ownerId, entityType: operation.entityType, entityId: operation.entityId, serverVersion: version, payload: operation.payload, deleted: operation.operationType === 'DELETE', updatedAt }
    transaction.objectStore('sync_metadata').put(metadata)
    if (operation.operationType === 'DELETE') {
      const tombstone = await requestResult(transaction.objectStore('deletion_tombstones').get(`${operation.ownerId}:${operation.entityType}:${operation.entityId}`)) as DeletionTombstone | undefined
      if (tombstone) transaction.objectStore('deletion_tombstones').put({ ...tombstone, acknowledgedAt: updatedAt })
    } else {
      transaction.objectStore('deletion_tombstones').delete(`${operation.ownerId}:${operation.entityType}:${operation.entityId}`)
    }
    await done
  }

  async saveConflict(operation: OutboxOperation, remote: ServerEntity, localPayload: Record<string, unknown> | null, paths: string[], localVersion: number) {
    const database = await this.open()
    const transaction = database.transaction(['sync_outbox', 'conflict_records', 'sync_metadata'], 'readwrite')
    const done = transactionDone(transaction)
    const conflict: SyncConflict = {
      conflictId: `${operation.ownerId}:${operation.entityType}:${operation.entityId}`,
      ownerId: operation.ownerId, operationId: operation.operationId,
      entityType: operation.entityType, entityId: operation.entityId,
      basePayload: operation.basePayload, localPayload, remotePayload: remote.payload,
      remoteVersion: remote.version, remoteDeleted: remote.deletedAt !== null,
      conflictingPaths: paths, createdAt: new Date().toISOString(), localVersionAtConflict: localVersion,
    }
    transaction.objectStore('sync_outbox').put({ ...operation, status: 'conflict', startedAt: undefined, lastError: 'A newer cloud version exists.' })
    transaction.objectStore('conflict_records').put(conflict)
    transaction.objectStore('sync_metadata').put({ key: `${operation.ownerId}:${metadataKey(operation.entityType, operation.entityId)}`, ownerId: operation.ownerId, entityType: operation.entityType, entityId: operation.entityId, serverVersion: remote.version, payload: remote.payload, deleted: remote.deletedAt !== null, updatedAt: remote.updatedAt } satisfies SyncMetadata)
    await done
    return conflict
  }

  async applyRemote(ownerId: string, entity: ServerEntity, apply: (data: T, entity: ServerEntity) => T) {
    const database = await this.open()
    const transaction = database.transaction(['workspaces', 'sync_metadata', 'sync_outbox', 'deletion_tombstones'], 'readwrite')
    const done = transactionDone(transaction)
    const workspaces = transaction.objectStore('workspaces')
    const workspace = await requestResult(workspaces.get(ownerId)) as WorkspaceRecord<T> | undefined
    if (!workspace) { transaction.abort(); await done; return }
    const key = metadataKey(entity.entityType, entity.entityId)
    const metaStore = transaction.objectStore('sync_metadata')
    const previousMeta = await requestResult(metaStore.get(`${ownerId}:${key}`)) as SyncMetadata | undefined
    if (previousMeta && previousMeta.serverVersion >= entity.version) { await done; return }
    const operations = await requestResult(transaction.objectStore('sync_outbox').index(OWNER_INDEX).getAll(ownerId)) as OutboxOperation[]
    const pending = operations.filter((item) => item.entityType === entity.entityType && item.entityId === entity.entityId && isUnfinished(item.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const metadata: SyncMetadata = { key: `${ownerId}:${key}`, ownerId, entityType: entity.entityType, entityId: entity.entityId, serverVersion: entity.version, payload: entity.payload, deleted: entity.deletedAt !== null, updatedAt: entity.updatedAt }
    metaStore.put(metadata)
    if (workspace.needsReconciliation) { await done; return }
    if (pending.length) {
      const operation = pending[0]
      if (entity.version !== operation.baseServerVersion) {
        const conflict: SyncConflict = {
          conflictId: `${ownerId}:${entity.entityType}:${entity.entityId}`, ownerId,
          operationId: operation.operationId, entityType: entity.entityType, entityId: entity.entityId,
          basePayload: operation.basePayload, localPayload: operation.payload,
          remotePayload: entity.payload, remoteVersion: entity.version, remoteDeleted: entity.deletedAt !== null,
          conflictingPaths: ['record'], createdAt: new Date().toISOString(), localVersionAtConflict: workspace.localVersion,
        }
        transaction.objectStore('sync_outbox').put({ ...operation, status: 'conflict', lastError: 'A newer cloud version exists.' })
        transaction.objectStore('conflict_records').put(conflict)
      }
      await done
      return
    }
    if (!workspace.needsReconciliation) workspaces.put({ ...workspace, data: apply(workspace.data, entity), localVersion: workspace.localVersion + 1, updatedAt: new Date().toISOString() })
    if (entity.deletedAt) {
      transaction.objectStore('deletion_tombstones').put({ tombstoneId: `${ownerId}:${entity.entityType}:${entity.entityId}`, ownerId, entityType: entity.entityType, entityId: entity.entityId, operationId: 'remote', createdAt: entity.deletedAt, acknowledgedAt: entity.updatedAt } satisfies DeletionTombstone)
    }
    await done
  }

  async finishLegacyReconciliation(ownerId: string, empty: T, diff: (before: T, after: T) => EntityChange[], apply: (data: T, entity: ServerEntity) => T) {
    const database = await this.open()
    const transaction = database.transaction(['workspaces', 'sync_metadata', 'sync_outbox', 'conflict_records', 'deletion_tombstones'], 'readwrite')
    const done = transactionDone(transaction)
    const workspaceStore = transaction.objectStore('workspaces')
    const workspace = await requestResult(workspaceStore.get(ownerId)) as WorkspaceRecord<T> | undefined
    if (!workspace?.needsReconciliation) { await done; return }
    const [metadataRows, outboxRows] = await Promise.all([
      requestResult(transaction.objectStore('sync_metadata').index(OWNER_INDEX).getAll(ownerId)) as Promise<SyncMetadata[]>,
      requestResult(transaction.objectStore('sync_outbox').index(OWNER_INDEX).getAll(ownerId)) as Promise<OutboxOperation[]>,
    ])
    const metadataByKey = new Map(metadataRows.map((item) => [metadataKey(item.entityType, item.entityId), item]))
    const localChanges = diff(empty, workspace.data)
    const localKeys = new Set(localChanges.map((item) => metadataKey(item.entityType, item.entityId)))
    for (const local of localChanges) {
      const key = metadataKey(local.entityType, local.entityId)
      const remote = metadataByKey.get(key)
      if (!remote || remote.deleted) {
        if (remote?.deleted) {
          const conflict: SyncConflict = { conflictId: `${ownerId}:${local.entityType}:${local.entityId}`, ownerId, operationId: '', entityType: local.entityType, entityId: local.entityId, basePayload: null, localPayload: local.payload, remotePayload: null, remoteVersion: remote.serverVersion, remoteDeleted: true, conflictingPaths: ['record'], createdAt: new Date().toISOString(), localVersionAtConflict: workspace.localVersion }
          transaction.objectStore('conflict_records').put(conflict)
        } else addOperation(transaction, outboxRows, metadataByKey, ownerId, local)
      } else if (JSON.stringify(local.payload) !== JSON.stringify(remote.payload)) {
        const conflict: SyncConflict = { conflictId: `${ownerId}:${local.entityType}:${local.entityId}`, ownerId, operationId: '', entityType: local.entityType, entityId: local.entityId, basePayload: null, localPayload: local.payload, remotePayload: remote.payload, remoteVersion: remote.serverVersion, remoteDeleted: false, conflictingPaths: ['record'], createdAt: new Date().toISOString(), localVersionAtConflict: workspace.localVersion }
        transaction.objectStore('conflict_records').put(conflict)
      }
    }
    for (const remote of metadataRows) {
      const key = metadataKey(remote.entityType, remote.entityId)
      if (!localKeys.has(key) && !remote.deleted) {
        const server: ServerEntity = { entityType: remote.entityType, entityId: remote.entityId, payload: remote.payload, version: remote.serverVersion, deletedAt: null, updatedAt: remote.updatedAt }
        workspace.data = apply(workspace.data, server)
      }
    }
    workspace.needsReconciliation = false
    workspaceStore.put(workspace)
    await done
  }

  async resolveConflict(ownerId: string, conflictId: string, choice: 'local' | 'remote', currentPayload: Record<string, unknown> | null, apply: (data: T, entity: ServerEntity) => T) {
    const database = await this.open()
    const transaction = database.transaction(['workspaces', 'sync_outbox', 'sync_metadata', 'conflict_records', 'deletion_tombstones'], 'readwrite')
    const done = transactionDone(transaction)
    const conflictStore = transaction.objectStore('conflict_records')
    const conflict = await requestResult(conflictStore.get(conflictId)) as SyncConflict | undefined
    const workspaceStore = transaction.objectStore('workspaces')
    const workspace = await requestResult(workspaceStore.get(ownerId)) as WorkspaceRecord<T> | undefined
    if (!conflict || conflict.ownerId !== ownerId || !workspace) { transaction.abort(); try { await done } catch {} ; throw new Error('This conflict is no longer available for this account.') }
    const outboxStore = transaction.objectStore('sync_outbox')
    const operations = await requestResult(outboxStore.index(OWNER_INDEX).getAll(ownerId)) as OutboxOperation[]
    for (const operation of operations) if (operation.entityType === conflict.entityType && operation.entityId === conflict.entityId && isUnfinished(operation.status)) outboxStore.put({ ...operation, status: 'superseded', lastError: `Resolved by user choice: ${choice}.` })
    const metaStore = transaction.objectStore('sync_metadata')
    const meta: SyncMetadata = { key: `${ownerId}:${metadataKey(conflict.entityType, conflict.entityId)}`, ownerId, entityType: conflict.entityType, entityId: conflict.entityId, serverVersion: conflict.remoteVersion, payload: conflict.remotePayload, deleted: conflict.remoteDeleted, updatedAt: new Date().toISOString() }
    metaStore.put(meta)
    if (choice === 'remote') {
      workspace.data = apply(workspace.data, { entityType: conflict.entityType, entityId: conflict.entityId, payload: conflict.remotePayload, version: conflict.remoteVersion, deletedAt: conflict.remoteDeleted ? new Date().toISOString() : null, updatedAt: new Date().toISOString() })
      if (conflict.remoteDeleted) transaction.objectStore('deletion_tombstones').put({ tombstoneId: `${ownerId}:${conflict.entityType}:${conflict.entityId}`, ownerId, entityType: conflict.entityType, entityId: conflict.entityId, operationId: conflict.operationId || 'remote', createdAt: new Date().toISOString(), acknowledgedAt: new Date().toISOString() } satisfies DeletionTombstone)
    } else {
      workspace.data = apply(workspace.data, { entityType: conflict.entityType, entityId: conflict.entityId, payload: currentPayload, version: conflict.remoteVersion, deletedAt: null, updatedAt: new Date().toISOString() })
      const operation: OutboxOperation = { operationId: crypto.randomUUID(), ownerId, entityType: conflict.entityType, entityId: conflict.entityId, operationType: currentPayload ? conflict.remoteDeleted ? 'CREATE' : 'UPDATE' : 'DELETE', payload: currentPayload, basePayload: conflict.remotePayload, baseServerVersion: conflict.remoteVersion, createdAt: new Date().toISOString(), retryCount: 0, nextRetryAt: 0, status: 'pending' }
      outboxStore.put(operation)
      if (!currentPayload) transaction.objectStore('deletion_tombstones').put({ tombstoneId: `${ownerId}:${conflict.entityType}:${conflict.entityId}`, ownerId, entityType: conflict.entityType, entityId: conflict.entityId, operationId: operation.operationId, createdAt: operation.createdAt } satisfies DeletionTombstone)
    }
    workspace.localVersion += 1
    workspace.updatedAt = new Date().toISOString()
    workspaceStore.put(workspace)
    conflictStore.put({ ...conflict, resolvedAt: new Date().toISOString(), resolution: choice })
    await done
    return workspace
  }

  async retryFailed(operationId: string, ownerId: string) {
    const database = await this.open()
    const transaction = database.transaction('sync_outbox', 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore('sync_outbox')
    const operation = await requestResult(store.get(operationId)) as OutboxOperation | undefined
    if (!operation || operation.ownerId !== ownerId || operation.status !== 'failed') { transaction.abort(); try { await done } catch {} ; return }
    store.put({ ...operation, status: 'pending', retryCount: 0, nextRetryAt: 0, lastError: undefined })
    await done
  }

  async getSyncState(ownerId: string): Promise<{ state: string; pending: number; failed: number; conflicts: number }> {
    const [outbox, conflicts] = await Promise.all([this.listOutbox(ownerId), this.listConflicts(ownerId)])
    const active = outbox.filter((item) => isUnfinished(item.status))
    const failed = active.filter((item) => item.status === 'failed')
    return { state: conflicts.length ? 'conflict' : failed.length ? 'failed' : active.some((item) => item.status === 'syncing') ? 'syncing' : active.length ? 'pending' : 'synced', pending: active.length, failed: failed.length, conflicts: conflicts.length }
  }

  async close() {
    if (this.databasePromise) (await this.databasePromise).close()
    this.databasePromise = null
  }

  private async updateOperation(operationId: string, patch: Partial<OutboxOperation>) {
    const database = await this.open()
    const transaction = database.transaction('sync_outbox', 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore('sync_outbox')
    const operation = await requestResult(store.get(operationId)) as OutboxOperation | undefined
    if (operation) store.put({ ...operation, ...patch })
    await done
  }
}

export function metadataKey(type: EntityType, id: string) { return `${type}:${id}` }
export function isUnfinished(status: OutboxOperation['status']) { return ['pending', 'syncing', 'failed', 'conflict'].includes(status) }

export function addOperation(transaction: IDBTransaction, outboxRows: OutboxOperation[], metadataByKey: Map<string, SyncMetadata>, ownerId: string, change: EntityChange) {
  const metadata = metadataByKey.get(metadataKey(change.entityType, change.entityId))
  const operation: OutboxOperation = { operationId: crypto.randomUUID(), ownerId, entityType: change.entityType, entityId: change.entityId, operationType: change.operationType, payload: change.payload, basePayload: metadata?.payload ?? null, baseServerVersion: metadata?.serverVersion ?? 0, createdAt: new Date().toISOString(), retryCount: 0, nextRetryAt: 0, status: 'pending' }
  transaction.objectStore('sync_outbox').add(operation)
  outboxRows.push(operation)
  if (operation.operationType === 'DELETE') transaction.objectStore('deletion_tombstones').put({ tombstoneId: `${ownerId}:${change.entityType}:${change.entityId}`, ownerId, entityType: change.entityType, entityId: change.entityId, operationId: operation.operationId, createdAt: operation.createdAt } satisfies DeletionTombstone)
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
  })
}
