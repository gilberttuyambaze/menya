const MISSING = Symbol('missing')
type MergeValue = unknown | typeof MISSING

export function mergeDisjointChanges(base: Record<string, unknown> | null, local: Record<string, unknown> | null, remote: Record<string, unknown> | null) {
  if (!base || !local || !remote) return { merged: null, conflictingPaths: ['record'] }
  const conflicts: string[] = []
  const merged = mergeValue(base, local, remote, '', conflicts)
  return { merged: isRecord(merged) ? merged : null, conflictingPaths: conflicts }
}

function mergeValue(base: MergeValue, local: MergeValue, remote: MergeValue, path: string, conflicts: string[]): MergeValue {
  if (same(local, base)) return clone(remote)
  if (same(remote, base)) return clone(local)
  if (same(local, remote)) return clone(local)
  if (isRecord(local) && isRecord(remote) && (isRecord(base) || base === MISSING)) {
    const result: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(base === MISSING ? {} : base), ...Object.keys(local), ...Object.keys(remote)])
    for (const key of keys) {
      const before = base !== MISSING && Object.hasOwn(base, key) ? base[key] : MISSING
      const ours = Object.hasOwn(local, key) ? local[key] : MISSING
      const theirs = Object.hasOwn(remote, key) ? remote[key] : MISSING
      const value = mergeValue(before, ours, theirs, path ? `${path}.${key}` : key, conflicts)
      if (value !== MISSING) result[key] = value
    }
    return result
  }
  conflicts.push(path || 'record')
  return clone(local)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function same(left: MergeValue, right: MergeValue) {
  if (left === MISSING || right === MISSING) return left === right
  return JSON.stringify(left) === JSON.stringify(right)
}

function clone(value: MergeValue): MergeValue {
  if (value === MISSING) return MISSING
  if (value === undefined) return undefined
  return structuredClone(value)
}
