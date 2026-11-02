import type { Store, Session } from './models'
import type { EntityChange, EntityType, ServerEntity } from '../../lib/offline/types'

type EntityMap = Map<string, Record<string, unknown>>

function entries(store: Store, type: EntityType): EntityMap {
  switch (type) {
    case 'session': return new Map(store.sessions.map((item) => [item.id, item as unknown as Record<string, unknown>]))
    case 'topic': return new Map(store.topics.map((name) => [name, { name }]))
    case 'plan': return new Map(store.plans.map((item) => [item.id, item as unknown as Record<string, unknown>]))
    case 'review': return new Map(store.reviews.map((item) => [item.week, item as unknown as Record<string, unknown>]))
    case 'group': return new Map(store.groups.map((name) => [name, { name }]))
    case 'audit': return new Map(store.audit.map((item) => [item.id, item as unknown as Record<string, unknown>]))
    case 'settings': return new Map([['profile', { name: store.name, rules: store.rules, theme: store.theme }]])
  }
}

export function diffWorkspace(previous: Store, next: Store): EntityChange[] {
  const changes: EntityChange[] = []
  const types: EntityType[] = ['session', 'topic', 'plan', 'review', 'group', 'settings', 'audit']
  for (const type of types) {
    const before = entries(previous, type)
    const after = entries(next, type)
    const ids = new Set([...before.keys(), ...after.keys()])
    for (const entityId of ids) {
      const oldPayload = before.get(entityId) ?? null
      const newPayload = after.get(entityId) ?? null
      if (JSON.stringify(oldPayload) === JSON.stringify(newPayload)) continue
      changes.push({
        entityType: type,
        entityId,
        operationType: newPayload === null ? 'DELETE' : oldPayload === null ? 'CREATE' : 'UPDATE',
        payload: newPayload,
        previousPayload: oldPayload,
      })
    }
  }
  return changes
}

export function readWorkspaceEntity(store: Store, type: EntityType, id: string) {
  return entries(store, type).get(id) ?? null
}

export function applyWorkspaceEntity(store: Store, entity: ServerEntity): Store {
  const { entityType, entityId, payload, deletedAt } = entity
  const deleted = deletedAt !== null || payload === null
  switch (entityType) {
    case 'session': {
      const sessions = store.sessions.filter((item) => item.id !== entityId)
      if (!deleted) sessions.push(payload as unknown as Session)
      return { ...store, sessions }
    }
    case 'topic': {
      const topics = store.topics.filter((item) => item !== entityId)
      if (!deleted && typeof payload?.name === 'string') topics.push(payload.name)
      return { ...store, topics: [...new Set(topics)] }
    }
    case 'plan': {
      const plans = store.plans.filter((item) => item.id !== entityId)
      if (!deleted) plans.push(payload as unknown as Store['plans'][number])
      return { ...store, plans }
    }
    case 'review': {
      const reviews = store.reviews.filter((item) => item.week !== entityId)
      if (!deleted) reviews.push(payload as unknown as Store['reviews'][number])
      return { ...store, reviews }
    }
    case 'group': {
      const groups = store.groups.filter((item) => item !== entityId)
      if (!deleted && typeof payload?.name === 'string') groups.push(payload.name)
      return { ...store, groups: [...new Set(groups)] }
    }
    case 'settings': {
      if (deleted || !payload) return store
      return { ...store, name: String(payload.name ?? store.name), rules: { ...store.rules, ...(payload.rules as Partial<Store['rules']> ?? {}) }, theme: payload.theme === 'light' ? 'light' : payload.theme === 'dark' ? 'dark' : store.theme }
    }
    case 'audit': {
      const audit = store.audit.filter((item) => item.id !== entityId)
      if (!deleted) audit.push(payload as unknown as Store['audit'][number])
      return { ...store, audit }
    }
  }
}

export function serverEntityToRecord(entity: ServerEntity) {
  return entity
}
