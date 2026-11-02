import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import {
  Check,
  X,
} from 'lucide-react'
import {
  DEFAULT_LEARNING_RULES,
  summarizeSessions,
} from '../lib/learning-engine'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import { IndexedDbLearningRepository } from '../lib/offline/indexeddb-repository'
import { synchronize } from '../lib/offline/sync-engine'
import type { OutboxOperation, SyncConflict } from '../lib/offline/types'
import { applyWorkspaceEntity, diffWorkspace, readWorkspaceEntity } from './data/workspace-records'

import {
  EMPTY_WORKSPACE,
  type Store,
  type Session,
  type AuditRecord,
} from './data/models'
import { TopBar } from './components/TopBar'
import { Sidebar, type NavPage } from './components/Sidebar'
import { DashboardView } from './components/DashboardView'
import {
  LearningView,
  PlannerView,
  AnalyticsView,
  ReviewView,
  GroupsView,
  AchievementsView,
  AssistantView,
  SettingsView,
  AuthPanel,
  SessionModal,
} from './components/OtherViews'

const STORE_KEY = 'menya.workspace.v2'
const repository = new IndexedDbLearningRepository<Store>()
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const today = () => dateKey(new Date())

function normalizeStore(saved: unknown): Store {
  const data = (saved && typeof saved === 'object' ? saved : {}) as Partial<Store>
  const seededFixture = [...(data.sessions ?? []), ...(data.plans ?? [])].some((item) => item.id.startsWith('seed-'))
  const demoTopics = ['Projectile Motion', "Newton's Laws", 'Wave Optics', 'Circular Motion', 'Electric Circuits', 'Thermodynamics', 'Calculus & Derivatives', 'Rotational Dynamics']
  return {
    ...EMPTY_WORKSPACE, ...data,
    rules: { ...DEFAULT_LEARNING_RULES, ...data.rules, ranks: data.rules?.ranks ?? DEFAULT_LEARNING_RULES.ranks },
    sessions: (data.sessions ?? []).filter((item) => !item.id.startsWith('seed-')).map((s) => ({ ...s, difficulty: s.difficulty === 'Moderate' ? 'Medium' : s.difficulty })),
    plans: (data.plans ?? []).filter((item) => !item.id.startsWith('seed-')),
    topics: (data.topics ?? []).filter((item) => !seededFixture || !demoTopics.includes(item)),
    groups: (data.groups ?? []).filter((item) => !seededFixture || !['Quantum Mechanics Circle', 'Physics Olympiad Study Group'].includes(item)),
    reviews: seededFixture ? [] : data.reviews ?? [], audit: data.audit ?? [], name: seededFixture && data.name === 'Alex Chen' ? '' : data.name ?? '',
  }
}

export default function App() {
  const [store, setStore] = useState<Store>(EMPTY_WORKSPACE)
  const [page, setPage] = useState<NavPage>('Dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSession, setShowSession] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [editing, setEditing] = useState<Session | null>(null)
  const [toast, setToast] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [databaseReady, setDatabaseReady] = useState(false)
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null)
  const [storageError, setStorageError] = useState('')
  const [syncMessage, setSyncMessage] = useState('Saved on this device')
  const [syncState, setSyncState] = useState<'offline' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'>('offline')
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const workspaceRef = useRef<Store>(EMPTY_WORKSPACE)
  const workspaceVersion = useRef(0)
  const mutationQueue = useRef(Promise.resolve())
  const activeOwnerRef = useRef('anonymous')
  const ownerId = user?.id ?? 'anonymous'
  const contentRef = useRef<HTMLElement>(null)

  const summary = useMemo(
    () => summarizeSessions(store.sessions, store.rules),
    [store.sessions, store.rules]
  )

  useEffect(() => { document.documentElement.dataset.theme = store.theme }, [store.theme])

  useEffect(() => {
    if (!supabase) { setUser(null); setAuthReady(true); return }
    let active = true
    let authEventReceived = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || authEventReceived) return
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    }).catch(() => { if (active && !authEventReceived) setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      authEventReceived = true
      setUser(session?.user ?? null)
      setAuthReady(true)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        setAuthOpen(true)
        window.setTimeout(() => { void supabase?.rpc('record_my_auth_event', { p_event_type: 'password_recovery' }) }, 0)
      }
      if (event === 'SIGNED_IN') window.setTimeout(() => {
        void supabase?.rpc('record_my_auth_event', { p_event_type: 'sign_in' })
        void supabase?.functions.invoke('send-communication', { body: { eventType: 'welcome' } })
      }, 0)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => { if (user && !passwordRecovery) setAuthOpen(false) }, [user?.id, passwordRecovery])

  useEffect(() => {
    let active = true
    if (!authReady || !user) {
      setStorageReady(false)
      setDatabaseReady(false)
      setLoadedOwner(null)
      return () => { active = false }
    }
    setStorageReady(false)
    setDatabaseReady(false)
    setStorageError('')
    const owner = user.id
    activeOwnerRef.current = owner
    const key = `${STORE_KEY}.${user.id}`
    void repository.loadOrMigrate(owner, EMPTY_WORKSPACE, key, window.localStorage, normalizeStore).then((record) => {
      if (!active) return
      workspaceRef.current = record.data
      workspaceVersion.current = record.localVersion
      setStore(record.data)
      setStorageReady(true)
      setLoadedOwner(owner)
      setSyncMessage(record.needsReconciliation ? 'Reviewing existing cloud data…' : 'Saved on this device')
    }).catch((error: unknown) => { if (active) { const message = error instanceof Error ? error.message : 'Local storage unavailable'; setStorageError(message); setSyncMessage(`Local storage error: ${message}`) } })
    return () => { active = false }
  }, [authReady, user?.id])

  const mutateStore = (update: (current: Store) => Store, onCommitted?: () => void) => {
    mutationQueue.current = mutationQueue.current.then(async () => {
      if (!storageReady) return
      const mutationOwner = ownerId
      if (activeOwnerRef.current !== mutationOwner) return
      const latest = await repository.getWorkspace(mutationOwner)
      if (!latest) throw new Error('The local workspace is unavailable.')
      if (latest.localVersion !== workspaceVersion.current) {
        workspaceRef.current = latest.data
        workspaceVersion.current = latest.localVersion
        setStore(latest.data)
      }
      const previous = latest.data
      const next = update(previous)
      const saved = await repository.commitWorkspace(mutationOwner, next, latest.localVersion, diffWorkspace(previous, next), Boolean(supabase && user))
      if (activeOwnerRef.current !== mutationOwner) return
      workspaceRef.current = next
      workspaceVersion.current = saved.localVersion
      setStore(next)
      setSyncMessage(supabase && user ? 'Saved on this device · waiting to sync' : 'Saved on this device')
      const state = await repository.getSyncState(ownerId)
      setSyncState(state.state as typeof syncState)
      onCommitted?.()
    }).catch((error: unknown) => setSyncMessage(error instanceof Error ? `Could not save locally: ${error.message}` : 'Could not save locally'))
  }

  useEffect(() => {
    if (!storageReady || !user || !supabase) return
    let active = true
    let running = false
    const client = supabase
    const run = async () => {
      if (running) return
      if (navigator.onLine === false) {
        setSyncState('offline')
        setSyncMessage('Supabase is unavailable offline; showing this account’s saved device cache.')
        setDatabaseReady(true)
        return
      }
      running = true
      const transport = {
        apply: async (op: import('../lib/offline/types').OutboxOperation) => {
          const { data, error } = await client.rpc('apply_learning_sync_operation', { p_operation_id: op.operationId, p_entity_type: op.entityType, p_entity_id: op.entityId, p_operation_type: op.operationType, p_payload: op.payload, p_expected_version: op.baseServerVersion })
          if (error) throw error
          const result = data as { ok: boolean; version?: number; updatedAt?: string; conflict?: import('../lib/offline/types').ServerEntity }
          if (!result.ok && result.conflict) return { ok: false as const, conflict: result.conflict }
          if (!result.ok) throw new Error('The cloud record no longer exists; resolve it from the conflict panel.')
          return { ok: true as const, version: result.version!, updatedAt: result.updatedAt! }
        },
        listPage: async (after: string | null, limit: number) => {
          const offset = after ? Number(after) : 0
          let query = client.from('learning_sync_records').select('entity_type,entity_id,payload,server_version,deleted_at,updated_at').eq('owner_id', user.id).order('updated_at').order('entity_type').order('entity_id').range(offset, offset + limit - 1)
          const { data, error } = await query
          if (error) throw error
          const rows = (data ?? []).map((row) => ({ entityType: row.entity_type, entityId: row.entity_id, payload: row.payload, version: row.server_version, deletedAt: row.deleted_at, updatedAt: row.updated_at })) as import('../lib/offline/types').ServerEntity[]
          return { rows, cursor: rows.length === limit ? String(offset + limit) : null }
        },
      }
      try {
        const result = await synchronize({ ownerId: user.id, repository, transport, applyRemote: applyWorkspaceEntity, currentLocalVersion: async () => (await repository.getWorkspace(user.id))?.localVersion ?? 0, legacy: { empty: EMPTY_WORKSPACE, diff: diffWorkspace }, options: { onState: (state) => active && setSyncState(state) } })
        if (active) {
          const record = await repository.getWorkspace(user.id)
          if (record) { workspaceRef.current = record.data; workspaceVersion.current = record.localVersion; setStore(record.data) }
          setConflicts(await repository.listConflicts(user.id))
          setSyncMessage(result.state === 'synced' ? 'All changes synchronized' : `Sync status: ${result.state}`)
        }
      } catch (error) { if (active) { setSyncState('failed'); setSyncMessage(error instanceof Error ? `Sync paused: ${error.message}` : 'Sync paused') } }
      finally { running = false; if (active) setDatabaseReady(true) }
    }
    void run()
    const online = () => { void run() }
    const offline = () => { if (active) setSyncState('offline') }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    const retryTimer = window.setInterval(() => { if (navigator.onLine) void run() }, 30_000)
    return () => { active = false; window.clearInterval(retryTimer); window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [storageReady, user?.id])

  useEffect(() => {
    if (contentRef.current) {
      gsap.fromTo(
        contentRef.current.querySelectorAll('.reveal'),
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, stagger: 0.045, clearProps: 'all' }
      )
    }
  }, [page])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(id)
  }, [toast])

  const patchStore = (patch: Partial<Store>) => {
    mutateStore((old) => ({ ...old, ...patch }))
  }

  const resolveConflict = async (conflict: SyncConflict, choice: 'local' | 'remote') => {
    const payload = choice === 'local' ? readWorkspaceEntity(workspaceRef.current, conflict.entityType, conflict.entityId) : null
    try {
      const record = await repository.resolveConflict(ownerId, conflict.conflictId, choice, payload, applyWorkspaceEntity)
      workspaceRef.current = record.data; workspaceVersion.current = record.localVersion; setStore(record.data)
      setConflicts(await repository.listConflicts(ownerId))
      setToast(`Kept ${choice === 'local' ? 'this device' : 'cloud'} version`)
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not resolve conflict') }
  }

  const importAnonymous = async () => {
    if (!user || !confirm('Import anonymous device records into this account? Existing records are kept, matching IDs are not duplicated, and anonymous data remains available.')) return
    const source = await repository.getWorkspace('anonymous')
    if (!source) return
    mutateStore((current) => ({
      ...current,
      sessions: [...current.sessions, ...source.data.sessions.filter((item) => !current.sessions.some((existing) => existing.id === item.id))],
      plans: [...current.plans, ...source.data.plans.filter((item) => !current.plans.some((existing) => existing.id === item.id))],
      reviews: [...current.reviews, ...source.data.reviews.filter((item) => !current.reviews.some((existing) => existing.week === item.week))],
      topics: [...new Set([...current.topics, ...source.data.topics])], groups: [...new Set([...current.groups, ...source.data.groups])],
    }))
  }

  const retryFailed = async () => {
    const operations: OutboxOperation[] = (await repository.listOutbox(ownerId)).filter((item) => item.status === 'failed')
    for (const operation of operations) await repository.retryFailed(operation.operationId, ownerId)
    setSyncState(operations.length ? 'pending' : syncState)
    setSyncMessage(operations.length ? 'Failed changes queued for retry' : 'No failed changes to retry')
  }

  const sendSummaryEmail = async () => {
    if (!supabase || !user) { setSyncMessage('Sign in to email a learning summary.'); return }
    const weekStartDate = new Date()
    weekStartDate.setHours(0, 0, 0, 0)
    weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7))
    const weekStart = dateKey(weekStartDate)
    const sessions = summary.daily.filter((day) => day.date >= weekStart).reduce((total, day) => total + day.sessions, 0)
    const { data, error } = await supabase.functions.invoke('send-communication', { body: { eventType: 'weekly_summary', periodStart: weekStart, minutes: summary.weekMinutes, sessions, attempts: summary.weekAttempts, correct: summary.weekCorrect, activeDays: summary.weekActiveDays } })
    setSyncMessage(error ? `Email could not be sent: ${error.message}` : data?.sent ? 'Weekly learning summary sent to your account email.' : 'That weekly summary was already sent or is queued.')
  }

  const saveSession = (session: Session) => {
    mutateStore((old) => {
      const previous = old.sessions.find((item) => item.id === session.id)
      const correction: AuditRecord | null = previous ? { id: crypto.randomUUID(), action: 'session.corrected', recordId: session.id, at: new Date().toISOString(), before: previous, after: session } : null
      return {
      ...old,
      sessions: [session, ...old.sessions.filter((item) => item.id !== session.id)],
      topics: old.topics.includes(session.topic)
        ? old.topics
        : [...old.topics, session.topic],
      audit: correction ? [correction, ...old.audit] : old.audit,
      }
    }, () => setToast('Study session saved on this device'))

    setShowSession(false)
    setEditing(null)
  }

  const removeSession = (id: string) => {
    if (
      !confirm(
        'Delete this session? The dashboard and analytics will recalculate from the remaining records.'
      )
    )
      return
    mutateStore((old) => {
      const before = old.sessions.find((session) => session.id === id)
      if (!before) return old
      const event: AuditRecord = { id: crypto.randomUUID(), action: 'session.deleted', recordId: id, at: new Date().toISOString(), before, after: null }
      return {
        ...old,
        sessions: old.sessions.filter((session) => session.id !== id),
        audit: [event, ...old.audit],
      }
    }, () => setToast('Session deleted on this device'))
  }

  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `menya-export-${today()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!authReady) {
    return <main className="auth-required-screen" role="status"><div className="auth-loading-mark">M</div><p>Checking your MENYA account…</p></main>
  }

  if (!user) {
    return <main className="auth-required-screen">
      <div className="menya-auth-gate-card">
        <AuthPanel user={null} syncMessage={supabaseConfigured ? 'Sign in is required to open MENYA.' : 'Supabase is not configured; connect the project before signing in.'} showStory />
      </div>
    </main>
  }

  if (!storageReady || loadedOwner !== ownerId || !databaseReady) {
    return <main className="min-h-screen grid place-items-center bg-[#0A1128] p-8 text-[#FFD700]" role="status">{storageError ? `MENYA could not open your saved account data: ${storageError}` : databaseReady ? 'Opening your account data…' : 'Loading your latest account data from Supabase…'}</main>
  }

  return (
    <div className={`nexus-browser-frame ${store.theme}`}>
      {/* Main Application Shell */}
      <div className="app-shell-layout">
        {/* Left Frosted Glass Sidebar */}
        <Sidebar
          currentPage={page}
          onNavigate={(p) => setPage(p)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {/* Main Content Area */}
        <main className="nexus-main-area">
          {/* Top Bar with Search & Live Health Indicators */}
          <TopBar
            userName={store.name || user?.email || 'Learner'}
            userRank={summary.rank}
            userLevel={summary.level}
            theme={store.theme}
            onToggleTheme={() => patchStore({ theme: store.theme === 'light' ? 'dark' : 'light' })}
            onOpenMobileNav={() => setMobileOpen(true)}
            onOpenSettings={() => user ? setPage('Profile & Settings') : setAuthOpen(true)}
            onOpenAssistant={() => setPage('AI Learning Assistant')}
            syncState={storageReady ? syncState : 'offline'}
            isAuthenticated={Boolean(user)}
            cloudEnabled={supabaseConfigured}
          />

          {/* Page View Body */}
          <section className="nexus-content-body" ref={contentRef}>
            {page === 'Dashboard' && (
              <DashboardView
                store={store}
                summary={summary}
                onNavigate={(p) => setPage(p)}
                onLog={() => {
                  setEditing(null)
                  setShowSession(true)
                }}
                onEdit={(s) => {
                  setEditing(s)
                  setShowSession(true)
                }}
                onDelete={removeSession}
                exportData={exportData}
              />
            )}

            {page === 'My Learning' && (
              <LearningView
                store={store}
                onTopics={(topics) => patchStore({ topics })}
                onLog={() => setShowSession(true)}
                onEdit={(s) => {
                  setEditing(s)
                  setShowSession(true)
                }}
                onDelete={removeSession}
              />
            )}

            {page === 'Study Planner' && (
              <PlannerView
                store={store}
                onPlans={(plans) => patchStore({ plans })}
              />
            )}

            {page === 'Analytics & Insights' && (
              <AnalyticsView
                sessions={store.sessions}
                rules={store.rules}
              />
            )}

            {page === 'Weekly Review' && (
              <ReviewView
                store={store}
                onReviews={(reviews) => patchStore({ reviews })}
              />
            )}

            {page === 'Learning Groups' && (
              <GroupsView
                groups={store.groups}
                onGroups={(groups) => patchStore({ groups })}
              />
            )}

            {page === 'Achievements' && (
              <AchievementsView
                store={store}
                summary={summary}
              />
            )}

            {page === 'AI Learning Assistant' && (
              <AssistantView
                sessions={store.sessions}
                onLog={() => setShowSession(true)}
              />
            )}

            {page === 'Profile & Settings' && (
              <SettingsView
                store={store}
                patchStore={patchStore}
                exportData={exportData}
                user={user}
                syncMessage={syncMessage}
                syncState={syncState}
                conflicts={conflicts}
                onResolveConflict={resolveConflict}
                onRetryFailed={retryFailed}
                onImportAnonymous={importAnonymous}
                onSendSummary={sendSummaryEmail}
              />
            )}
          </section>
        </main>
      </div>

      {/* Log / Edit Study Session Modal */}
      {showSession && (
        <SessionModal
          session={editing}
          topics={store.topics}
          onClose={() => {
            setShowSession(false)
            setEditing(null)
          }}
          onSave={saveSession}
        />
      )}

      {((authOpen && !user) || passwordRecovery) && (
        <div className="menya-auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false) }}>
          <div className="menya-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="menya-auth-title">
            <AuthPanel user={user} syncMessage={syncMessage} onClose={() => { setAuthOpen(false); setPasswordRecovery(false) }} recoveryMode={passwordRecovery} onRecoveryComplete={() => { setPasswordRecovery(false); setAuthOpen(false) }} />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="quantix-toast">
          <Check /> {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss">
            <X />
          </button>
        </div>
      )}
    </div>
  )
}
