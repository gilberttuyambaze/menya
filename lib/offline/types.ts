export type EntityType = 'session' | 'topic' | 'plan' | 'review' | 'group' | 'settings' | 'audit'
export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE'
export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'conflict' | 'synced' | 'superseded'
export type SyncState = 'offline' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'

export type EntityChange = {
  entityType: EntityType
  entityId: string
  operationType: OperationType
  payload: Record<string, unknown> | null
  previousPayload: Record<string, unknown> | null
}

export type WorkspaceRecord<T extends object> = {
  ownerId: string
  data: T
  localVersion: number
  updatedAt: string
  needsReconciliation: boolean
}

export type OutboxOperation = {
  operationId: string
  ownerId: string
  entityType: EntityType
  entityId: string
  operationType: OperationType
  payload: Record<string, unknown> | null
  basePayload: Record<string, unknown> | null
  baseServerVersion: number
  createdAt: string
  retryCount: number
  nextRetryAt: number
  status: OutboxStatus
  lastError?: string
  startedAt?: number
}

export type SyncMetadata = {
  key: string
  ownerId: string
  entityType: EntityType
  entityId: string
  serverVersion: number
  payload: Record<string, unknown> | null
  deleted: boolean
  updatedAt: string
}

export type SyncConflict<T extends object = Record<string, unknown>> = {
  conflictId: string
  ownerId: string
  operationId: string
  entityType: EntityType
  entityId: string
  basePayload: Record<string, unknown> | null
  localPayload: Record<string, unknown> | null
  remotePayload: Record<string, unknown> | null
  remoteVersion: number
  remoteDeleted: boolean
  conflictingPaths: string[]
  createdAt: string
  resolvedAt?: string
  resolution?: 'local' | 'remote' | 'merged'
  localVersionAtConflict?: number
  workspaceType?: T
}

export type DeletionTombstone = {
  tombstoneId: string
  ownerId: string
  entityType: EntityType
  entityId: string
  operationId: string
  createdAt: string
  acknowledgedAt?: string
}

export type ServerEntity = {
  entityType: EntityType
  entityId: string
  payload: Record<string, unknown> | null
  version: number
  deletedAt: string | null
  updatedAt: string
}
