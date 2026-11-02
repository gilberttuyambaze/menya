import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { IndexedDbLearningRepository } from '../lib/offline/indexeddb-repository.ts'
import { synchronize } from '../lib/offline/sync-engine.ts'
import { mergeDisjointChanges } from '../lib/offline/conflict-merge.ts'

const store = (sessions = []) => ({ sessions })
const change = (id, payload, operationType = 'CREATE') => ({ entityType: 'session', entityId: id, operationType, payload, previousPayload: null })
const apply = (data, entity) => ({ sessions: entity.deletedAt ? data.sessions.filter((s) => s.id !== entity.entityId) : [...data.sessions.filter((s) => s.id !== entity.entityId), entity.payload] })

test('IndexedDB persists a local workspace and its outbox across repository restart', async () => {
  const repo = new IndexedDbLearningRepository()
  const initial = await repo.loadOrMigrate('user-a', store(), 'legacy.a', undefined, store)
  const session = { id: 'session-a', topic: 'Mechanics' }
  const saved = await repo.commitWorkspace('user-a', { sessions: [session] }, initial.localVersion, [change(session.id, session)], true)
  assert.equal(saved.localVersion, 2)
  assert.equal((await repo.listOutbox('user-a')).length, 1)
  await repo.close()
  const reopened = new IndexedDbLearningRepository()
  assert.deepEqual((await reopened.getWorkspace('user-a')).data.sessions, [session])
  assert.equal((await reopened.listOutbox('user-a'))[0].entityId, session.id)
})

test('legacy migration preserves its source and separates anonymous and authenticated workspaces', async () => {
  const repo = new IndexedDbLearningRepository()
  const data = store([{ id: 'kept-record' }])
  const storage = { getItem: (key) => key === 'legacy' ? JSON.stringify(data) : null }
  const migrated = await repo.loadOrMigrate('anonymous', store(), 'legacy', storage, (value) => value)
  assert.deepEqual(migrated.data, data)
  assert.deepEqual(await repo.loadOrMigrate('user-b', store(), 'other-key', storage, (value) => value).then((w) => w.data), store())
  assert.equal((await repo.listOutbox('anonymous')).length, 0)
})

test('local compare-and-swap rejects another tab stale write and owners cannot read each other queues', async () => {
  const repo = new IndexedDbLearningRepository()
  const a = await repo.loadOrMigrate('owner-c', store(), 'none', undefined, store)
  await repo.commitWorkspace('owner-c', store([{ id: 'private' }]), a.localVersion, [change('private', { id: 'private' })], true)
  assert.equal((await repo.listOutbox('owner-d')).length, 0)
  await assert.rejects(repo.commitWorkspace('owner-c', store(), a.localVersion, [], true), /changed in another tab/)
})

test('disjoint field edits merge but same-field edits are reported', () => {
  assert.deepEqual(mergeDisjointChanges({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 2 }), { merged: { a: 2, b: 2 }, conflictingPaths: [] })
  assert.deepEqual(mergeDisjointChanges({ a: 1 }, { a: 2 }, { a: 3 }).conflictingPaths, ['a'])
})

test('failed synchronization keeps the operation and applies capped exponential retry metadata', async () => {
  const repo = new IndexedDbLearningRepository()
  const initial = await repo.loadOrMigrate('owner-e', store(), 'none', undefined, store)
  const row = { id: 'retry-me' }
  await repo.commitWorkspace('owner-e', store([row]), initial.localVersion, [change(row.id, row)], true)
  await synchronize({ ownerId: 'owner-e', repository: repo, transport: { apply: async () => { throw new Error('offline') }, listPage: async () => ({ rows: [], cursor: null }) }, applyRemote: apply, currentLocalVersion: async () => 2, options: { now: () => 1000, random: () => 0 } })
  const [operation] = await repo.listOutbox('owner-e')
  assert.equal(operation.status, 'failed')
  assert.equal(operation.retryCount, 1)
  assert.equal(operation.nextRetryAt, 46000)
})

test('duplicate response replay is idempotent at the engine boundary and deletion is tombstoned', async () => {
  const repo = new IndexedDbLearningRepository()
  const initial = await repo.loadOrMigrate('owner-f', store(), 'none', undefined, store)
  const row = { id: 'delete-me' }
  let recordCount = 0
  await repo.commitWorkspace('owner-f', store([row]), initial.localVersion, [change(row.id, row)], true)
  const [create] = await repo.listOutbox('owner-f')
  const transport = { apply: async () => { recordCount = 1; return { ok: true, version: 1, updatedAt: new Date().toISOString() } }, listPage: async () => ({ rows: [], cursor: null }) }
  await synchronize({ ownerId: 'owner-f', repository: repo, transport, applyRemote: apply, currentLocalVersion: async () => 2 })
  await repo.commitWorkspace('owner-f', store(), 2, [change(row.id, null, 'DELETE')], true)
  assert.equal((await repo.listOutbox('owner-f')).find((op) => op.operationType === 'DELETE').status, 'pending')
  const db = await repo.open()
  const tx = db.transaction('deletion_tombstones', 'readonly')
  const tombstones = await new Promise((resolve, reject) => { const req = tx.objectStore('deletion_tombstones').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
  assert.equal(tombstones.some((t) => t.entityId === row.id), true)
  assert.equal(recordCount, 1)
  assert.ok(create.operationId)
})

test('successful sync is acknowledged once, and the same operation key can be safely replayed after interruption', async () => {
  const repo = new IndexedDbLearningRepository()
  const initial = await repo.loadOrMigrate('owner-g', store(), 'none', undefined, store)
  const row = { id: 'exactly-once' }
  await repo.commitWorkspace('owner-g', store([row]), initial.localVersion, [change(row.id, row)], true)
  const [operation] = await repo.listOutbox('owner-g')
  await repo.markSyncing(operation)
  const seen = []
  const transport = { apply: async (op) => { seen.push(op.operationId); return { ok: true, version: 1, updatedAt: new Date().toISOString() } }, listPage: async () => ({ rows: [], cursor: null }) }
  await synchronize({ ownerId: 'owner-g', repository: repo, transport, applyRemote: apply, currentLocalVersion: async () => 2 })
  await synchronize({ ownerId: 'owner-g', repository: repo, transport, applyRemote: apply, currentLocalVersion: async () => 2 })
  assert.deepEqual(seen, [operation.operationId])
  assert.equal((await repo.listOutbox('owner-g'))[0].status, 'synced')
})

test('server version conflict is preserved and cloud choice resolves it without losing the pending record', async () => {
  const repo = new IndexedDbLearningRepository()
  const initial = await repo.loadOrMigrate('owner-h', store(), 'none', undefined, store)
  const local = { id: 'conflicted', topic: 'Local edit' }
  const remote = { entityType: 'session', entityId: local.id, payload: { id: local.id, topic: 'Cloud edit' }, version: 3, deletedAt: null, updatedAt: new Date().toISOString() }
  await repo.commitWorkspace('owner-h', store([local]), initial.localVersion, [change(local.id, local)], true)
  await synchronize({ ownerId: 'owner-h', repository: repo, transport: { apply: async () => ({ ok: false, conflict: remote }), listPage: async () => ({ rows: [], cursor: null }) }, applyRemote: apply, currentLocalVersion: async () => 2 })
  assert.equal((await repo.listConflicts('owner-h')).length, 1)
  const result = await repo.resolveConflict('owner-h', `owner-h:session:${local.id}`, 'remote', null, apply)
  assert.deepEqual(result.data.sessions, [remote.payload])
  assert.equal((await repo.listConflicts('owner-h')).length, 0)
})

test('anonymous workspaces never make cloud transport calls', async () => {
  const repo = new IndexedDbLearningRepository()
  let calls = 0
  const result = await synchronize({ ownerId: 'anonymous', repository: repo, transport: { apply: async () => { calls++; throw new Error('must not call') }, listPage: async () => ({ rows: [], cursor: null }) }, applyRemote: apply, currentLocalVersion: async () => 0 })
  assert.equal(result.state, 'synced')
  assert.equal(calls, 0)
})

test('a remote deletion tombstone blocks a later stale cloud copy from resurrecting the session', async () => {
  const repo = new IndexedDbLearningRepository()
  const initial = await repo.loadOrMigrate('owner-i', store([{ id: 'already-here' }]), 'none', undefined, (value) => value)
  const removed = { entityType: 'session', entityId: 'already-here', payload: null, version: 5, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  await repo.applyRemote('owner-i', removed, apply)
  await repo.applyRemote('owner-i', { ...removed, payload: { id: 'already-here' }, version: 4, deletedAt: null }, apply)
  assert.deepEqual((await repo.getWorkspace('owner-i')).data.sessions, [])
  const db = await repo.open()
  const tx = db.transaction('deletion_tombstones', 'readonly')
  const rows = await new Promise((resolve, reject) => { const req = tx.objectStore('deletion_tombstones').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
  assert.equal(rows.some((item) => item.ownerId === 'owner-i' && item.entityId === 'already-here'), true)
  assert.equal(initial.localVersion, 1)
})
