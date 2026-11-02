import { useEffect, useRef, useState, type FormEvent } from 'react'
import gsap from 'gsap'
import {
  BookOpen,
  CalendarDays,
  Activity,
  Check,
  CircleHelp,
  Clock3,
  Flame,
  Gauge,
  GraduationCap,
  Plus,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Users,
  X,
  ArrowDownToLine,
  Bell,
  BrainCircuit,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured, supabaseConfigurationError } from '../../lib/supabase'
import type { SyncConflict, SyncState } from '../../lib/offline/types'
import {
  topicMastery,
  summarizeWeek,
  validateStudySession,
  type LearningRules,
  type summarizeSessions,
} from '../../lib/learning-engine'
import type { Store, Session, Plan, Review } from '../data/models'

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const today = () => dateKey(new Date())
const weekKey = (date = new Date()) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dateKey(d)
}

function weekSessions(sessions: Session[]) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + i)
    const matches = sessions.filter(
      (s) => new Date(s.studiedAt).toDateString() === date.toDateString()
    )
    return {
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: matches.reduce((n, s) => n + s.minutes, 0),
      accuracy: matches.reduce((n, s) => n + s.attempted, 0)
        ? Math.round(
            (matches.reduce((n, s) => n + s.correct, 0) * 100) /
              matches.reduce((n, s) => n + s.attempted, 0)
          )
        : null,
    }
  })
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  accent = 'gold',
}: {
  icon: typeof Flame
  label: string
  value: string
  detail: string
  accent?: string
}) {
  return (
    <article className="quantix-metric-card">
      <div className={`metric-icon-box ${accent}`}>
        <Icon />
      </div>
      <div className="metric-info-copy">
        <span className="metric-label">{label}</span>
        <strong className="metric-val">{value}</strong>
        <small className="metric-sub">{detail}</small>
      </div>
    </article>
  )
}

export function SessionRow({
  session,
  onEdit,
  onDelete,
}: {
  session: Session
  onEdit: (s: Session) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="quantix-activity-row">
      <span className="activity-icon-bullet success">
        <Check />
      </span>
      <div className="activity-main-info">
        <strong>{session.topic}</strong>
        <small>
          {session.subject || 'Independent study'} · {session.minutes} min
          {session.attempted
            ? ` · ${Math.round((session.correct * 100) / session.attempted)}% accuracy`
            : ''}
        </small>
      </div>
      <time>{new Date(session.studiedAt).toLocaleDateString()}</time>
      <div className="row-actions-group">
        <button
          className="row-btn-action"
          aria-label={`Edit ${session.topic}`}
          onClick={() => onEdit(session)}
        >
          <Settings />
        </button>
        <button
          className="row-btn-action danger"
          aria-label={`Delete ${session.topic}`}
          onClick={() => onDelete(session.id)}
        >
          <Trash2 />
        </button>
      </div>
    </div>
  )
}

export function SessionModal({
  session,
  topics,
  onClose,
  onSave,
}: {
  session: Session | null
  topics: string[]
  onClose: () => void
  onSave: (s: Session) => void
}) {
  const [topic, setTopic] = useState(session?.topic || '')
  const [subject, setSubject] = useState(session?.subject || '')
  const [minutes, setMinutes] = useState(String(session?.minutes ?? 45))
  const [attempted, setAttempted] = useState(String(session?.attempted || 0))
  const [correct, setCorrect] = useState(String(session?.correct || 0))
  const [method, setMethod] = useState(session?.method || 'Practice')
  const [difficulty, setDifficulty] = useState(
    (session?.difficulty === 'Moderate' ? 'Medium' : session?.difficulty) || 'Medium'
  )
  const [date, setDate] = useState(
    session ? dateKey(new Date(session.studiedAt)) : today()
  )
  const [reflection, setReflection] = useState(session?.reflection || '')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const m = Number(minutes)
    const a = Number(attempted)
    const c = Number(correct)
    const validationError = validateStudySession({
      topic,
      date,
      minutes: m,
      attempted: a,
      correct: c,
    })
    if (validationError) {
      setError(validationError)
      return
    }
    onSave({
      id: session?.id || crypto.randomUUID(),
      topic: topic.trim(),
      subject: subject.trim(),
      minutes: m,
      attempted: a,
      correct: c,
      studiedAt: session
        ? new Date(
            `${date}T${new Date(session.studiedAt).toTimeString().slice(0, 8)}`
          ).toISOString()
        : new Date(`${date}T12:00:00`).toISOString(),
      method,
      difficulty,
      reflection,
    })
  }

  return (
    <div className="quantix-modal-backdrop" onClick={onClose}>
      <form
        className="quantix-log-modal session-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <button
          type="button"
          className="modal-close-x"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </button>
        <span className="modal-kicker">
          {session ? 'HISTORICAL CORRECTION' : 'NEW SESSION RECORD'}
        </span>
        <h2>{session ? 'Edit study session' : 'Log study session'}</h2>
        <p className="modal-sub">
          Record topic, duration, and problem accuracy to power your learning velocity.
        </p>

        <label className="field-label">
          Topic
          <input
            list="saved-topics"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Projectile motion"
            autoFocus
          />
          <datalist id="saved-topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        <div className="modal-form-grid">
          <label className="field-label">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Physics"
            />
          </label>
          <label className="field-label">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Minutes
            <input
              type="number"
              min="0"
              max="1440"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Study method
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option>Practice</option>
              <option>Reading</option>
              <option>Video lesson</option>
              <option>Problem solving</option>
              <option>Revision</option>
              <option>Discussion</option>
            </select>
          </label>
          <label className="field-label">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </label>
          <label className="field-label">
            Problems attempted
            <input
              type="number"
              min="0"
              value={attempted}
              onChange={(e) => setAttempted(e.target.value)}
            />
          </label>
          <label className="field-label">
            Problems correct
            <input
              type="number"
              min="0"
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
            />
          </label>
        </div>

        <label className="field-label">
          Reflection or next action
          <textarea
            rows={2}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What formulas or breakthroughs happened? What will you practice next?"
          />
        </label>

        {error && (
          <p className="quantix-form-error" role="alert">
            {error}
          </p>
        )}

        <button className="soft-gold-primary-button full-w" type="submit">
          <Check /> Save Session Record
        </button>
      </form>
    </div>
  )
}

export function LearningView({
  store,
  onTopics,
  onLog,
  onEdit,
  onDelete,
}: {
  store: Store
  onTopics: (t: string[]) => void
  onLog: () => void
  onEdit: (s: Session) => void
  onDelete: (id: string) => void
}) {
  const [topic, setTopic] = useState('')
  const add = (e: FormEvent) => {
    e.preventDefault()
    const name = topic.trim()
    if (!name) return
    onTopics([...new Set([...store.topics, name])])
    setTopic('')
  }
  const topics = [...new Set([...store.topics, ...store.sessions.map((s) => s.topic)])]
  const mastery = new Map(
    topicMastery(store.sessions, store.rules).map((entry) => [entry.topic, entry])
  )
  const byTopic = topics.map((name) => ({
    name,
    sessions: store.sessions.filter((s) => s.topic.toLowerCase() === name.toLowerCase()),
    subject:
      store.sessions.find((s) => s.topic.toLowerCase() === name.toLowerCase())?.subject ||
      'Independent learning',
    status: mastery.get(name)?.status ?? 'NO DATA',
  }))

  return (
    <div className="quantix-two-column reveal">
      <article className="quantix-panel">
        <div className="quantix-panel-head">
          <div>
            <span className="panel-kicker">CURRICULUM ARCHITECTURE</span>
            <h2>Topics & Subjects</h2>
          </div>
          <BookOpen className="panel-help-icon" />
        </div>
        <p className="quantix-support-copy">
          Organize topic concepts and formulas. Sessions connect dynamically when topic names align.
        </p>
        <form className="quantix-inline-form" onSubmit={add}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Add new topic, e.g. Quantum Wavefunctions"
            aria-label="New topic"
            required
          />
          <button className="soft-gold-primary-button">
            <Plus /> Add Topic
          </button>
        </form>
        <div className="quantix-topic-list">
          {byTopic.map((item) => {
            const attempts = item.sessions.reduce((n, s) => n + s.attempted, 0)
            const correct = item.sessions.reduce((n, s) => n + s.correct, 0)
            const pct = attempts ? Math.round((correct * 100) / attempts) : null
            return (
              <article className="quantix-topic-card" key={item.name}>
                <div className="quantix-topic-glyph">
                  <GraduationCap />
                </div>
                <div className="quantix-topic-body">
                  <strong>{item.name}</strong>
                  <small>
                    {item.subject} · {item.sessions.length} sessions ·{' '}
                    {item.sessions.reduce((n, s) => n + s.minutes, 0)} min ·{' '}
                    <span className={`status-badge ${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </small>
                  <div className="quantix-bar-track">
                    <div
                      className="quantix-bar-fill gold"
                      style={{ width: `${attempts ? (correct * 100) / attempts : 0}%` }}
                    />
                  </div>
                </div>
                <b className="topic-pct-num">{pct !== null ? `${pct}%` : '—'}</b>
                <button
                  className="row-btn-action danger"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onTopics(store.topics.filter((t) => t !== item.name))}
                >
                  <Trash2 />
                </button>
              </article>
            )
          })}
          {!byTopic.length && (
            <div className="quantix-empty-state">
              Your topics will show here. Create a topic or log a session to begin.
            </div>
          )}
        </div>
      </article>

      <article className="quantix-panel">
        <span className="panel-kicker">SESSION STREAM</span>
        <h2>Recent Learning Records</h2>
        <div className="quantix-activity-list">
          {store.sessions.map((s) => (
            <SessionRow key={s.id} session={s} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {!store.sessions.length && (
            <div className="quantix-empty-state">No study records logged yet.</div>
          )}
        </div>
        <button className="soft-gold-primary-button full-w mt-14" onClick={onLog}>
          <Plus /> Record Learning Activity
        </button>
      </article>
    </div>
  )
}

export function PlannerView({
  store,
  onPlans,
}: {
  store: Store
  onPlans: (p: Plan[]) => void
}) {
  const [topic, setTopic] = useState('')
  const [date, setDate] = useState(today())
  const [minutes, setMinutes] = useState('45')

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!topic.trim() || Number(minutes) < 1) return
    onPlans([
      ...store.plans,
      {
        id: crypto.randomUUID(),
        topic: topic.trim(),
        date,
        minutes: Number(minutes),
        complete: false,
      },
    ])
    setTopic('')
  }

  const change = (id: string, patch: Partial<Plan>) =>
    onPlans(store.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const plans = [...store.plans].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="quantix-two-column reveal">
      <article className="quantix-panel">
        <span className="panel-kicker">SCHEDULE HORIZON</span>
        <h2>Plan a Study Block</h2>
        <p className="quantix-support-copy">
          Planned minutes stay separate from recorded session completions until logged.
        </p>
        <form className="quantix-form-stack" onSubmit={add}>
          <label className="field-label">
            Topic Focus
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What concept or problems will you study?"
              required
            />
          </label>
          <div className="modal-form-grid">
            <label className="field-label">
              Target Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="field-label">
              Duration (minutes)
              <input
                type="number"
                min="0"
                max="1440"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </div>
          <button className="soft-gold-primary-button">
            <Plus /> Add To Planner
          </button>
        </form>
        <div className="quantix-note-box">
          <CalendarDays />
          <span>
            Recurring schedules and push notifications are active when cloud sync credentials are configured.
          </span>
        </div>
      </article>

      <article className="quantix-panel">
        <div className="quantix-panel-head">
          <div>
            <span className="panel-kicker">QUEUE</span>
            <h2>Upcoming Sessions</h2>
          </div>
          <span className="quantix-count-pill">
            {plans.filter((p) => !p.complete).length} pending
          </span>
        </div>
        <div className="quantix-plan-list">
          {plans.map((plan) => (
            <div
              className={`quantix-plan-row ${plan.complete ? 'completed' : ''}`}
              key={plan.id}
            >
              <button
                className={`plan-check-toggle ${plan.complete ? 'checked' : ''}`}
                aria-label="Toggle completed"
                onClick={() => change(plan.id, { complete: !plan.complete })}
              >
                {plan.complete && <Check />}
              </button>
              <div className="plan-copy">
                <strong>{plan.topic}</strong>
                <small>
                  {new Date(`${plan.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  · {plan.minutes} min
                </small>
              </div>
              <button
                className="row-btn-action danger"
                aria-label="Delete planned session"
                onClick={() => onPlans(store.plans.filter((p) => p.id !== plan.id))}
              >
                <Trash2 />
              </button>
            </div>
          ))}
          {!plans.length && (
            <div className="quantix-empty-state">
              Your planner is clear. Add a study block when you are ready.
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

export function AnalyticsView({
  sessions,
  rules,
}: {
  sessions: Session[]
  rules: LearningRules
}) {
  const goalMinutes = rules.weeklyTargetMinutes
  const days = weekSessions(sessions)
  const total = sessions.reduce((n, s) => n + s.minutes, 0)
  const attempts = sessions.reduce((n, s) => n + s.attempted, 0)
  const correct = sessions.reduce((n, s) => n + s.correct, 0)
  const mastery = new Map(
    topicMastery(sessions, rules).map((entry) => [entry.topic, entry.status])
  )
  const byTopic = [...new Set(sessions.map((s) => s.topic))]
    .map((topic) => {
      const rows = sessions.filter((s) => s.topic === topic)
      const a = rows.reduce((n, s) => n + s.attempted, 0)
      const c = rows.reduce((n, s) => n + s.correct, 0)
      return {
        topic,
        minutes: rows.reduce((n, s) => n + s.minutes, 0),
        attempts: a,
        accuracy: a ? Math.round((c * 100) / a) : null,
        status: mastery.get(topic) ?? 'NO DATA',
      }
    })
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))

  return (
    <>
      <div className="quantix-metrics-grid reveal">
        <Metric
          icon={Clock3}
          label="Lifetime Study Time"
          value={`${Math.floor(total / 60)}h ${total % 60}m`}
          detail={`${sessions.length} recorded sessions`}
          accent="blue"
        />
        <Metric
          icon={Gauge}
          label="Overall Accuracy"
          value={attempts ? `${Math.round((correct * 100) / attempts)}%` : '—'}
          detail={`${correct} correct of ${attempts} attempted`}
          accent="gold"
        />
        <Metric
          icon={CalendarDays}
          label="Active Study Days"
          value={`${new Set(sessions.map((s) => new Date(s.studiedAt).toDateString())).size}`}
          detail="Distinct dates with sessions"
          accent="violet"
        />
        <Metric
          icon={Target}
          label="Weekly Target"
          value={`${goalMinutes} min`}
          detail="Configurable in Settings"
          accent="emerald"
        />
      </div>

      <div className="quantix-two-column reveal">
        <article className="quantix-panel">
          <span className="panel-kicker">CONSISTENCY PATTERN</span>
          <h2>Minutes by Weekday</h2>
          <p className="quantix-support-copy">
            Pillars display recorded duration across each calendar day this week.
          </p>
          <div className="quantix-bar-chart large">
            {days.map((d) => (
              <div className="quantix-bar-col" key={d.label}>
                <span>{d.minutes || ''}</span>
                <div className="bar-track">
                  <i
                    style={{
                      height: `${Math.max(
                        d.minutes ? 6 : 0,
                        (d.minutes / Math.max(60, ...days.map((x) => x.minutes))) * 100
                      )}%`,
                    }}
                  />
                </div>
                <small>{d.label}</small>
              </div>
            ))}
          </div>
          <div className="quantix-chart-callout">
            <Activity />
            <p>
              <strong>{days.reduce((n, d) => n + d.minutes, 0)} minutes this week</strong>
              <br />
              Weekly goal of {goalMinutes} minutes.
            </p>
          </div>
        </article>

        <article className="quantix-panel">
          <span className="panel-kicker">MASTERY COMPARISON</span>
          <h2>Practice Accuracy by Topic</h2>
          <p className="quantix-support-copy">
            Accuracy is computed directly from problem attempts logged for each subject.
          </p>
          <div className="quantix-topic-list">
            {byTopic.map((t) => (
              <div className="quantix-topic-card" key={t.topic}>
                <div className="quantix-topic-body">
                  <strong>{t.topic}</strong>
                  <small>
                    {t.minutes} min · {t.attempts} attempts ·{' '}
                    <span className={`status-badge ${t.status.toLowerCase()}`}>
                      {t.status}
                    </span>
                  </small>
                  <div className="quantix-bar-track">
                    <div
                      className="quantix-bar-fill gold"
                      style={{ width: `${t.accuracy ?? 0}%` }}
                    />
                  </div>
                </div>
                <b className="topic-pct-num">{t.accuracy === null ? '—' : `${t.accuracy}%`}</b>
              </div>
            ))}
            {!byTopic.length && (
              <div className="quantix-empty-state">
                Topic comparisons will populate once problem attempts are logged.
              </div>
            )}
          </div>
          {byTopic.length > 0 && byTopic[0].accuracy !== null && (
            <div className="quantix-note-box">
              <CircleHelp />
              <span>
                {byTopic[0].accuracy! < 70
                  ? `${byTopic[0].topic} has the lowest recorded accuracy (${byTopic[0].accuracy}%). Consider another practice session.`
                  : 'Recorded topic accuracy is at least 70%. Great job! Keep reviewing regularly.'}
              </span>
            </div>
          )}
        </article>
      </div>
    </>
  )
}

export function ReviewView({
  store,
  onReviews,
}: {
  store: Store
  onReviews: (r: Review[]) => void
}) {
  const currentWeek = weekKey()
  const existing = store.reviews.find((r) => r.week === currentWeek)
  const stats = summarizeWeek(store.sessions, currentWeek, store.rules)

  const [wins, setWins] = useState(existing?.wins || '')
  const [difficulties, setDifficulties] = useState(existing?.difficulties || '')
  const [lessons, setLessons] = useState(existing?.lessons || '')
  const [nextFocus, setNextFocus] = useState(existing?.nextFocus || '')

  const save = (e: FormEvent) => {
    e.preventDefault()
    const review = {
      week: currentWeek,
      wins,
      difficulties,
      lessons,
      nextFocus,
      updatedAt: new Date().toISOString(),
    }
    onReviews([review, ...store.reviews.filter((r) => r.week !== currentWeek)])
  }

  return (
    <div className="quantix-two-column reveal">
      <article className="quantix-panel">
        <span className="panel-kicker">
          WEEK OF{' '}
          {new Date(`${currentWeek}T12:00:00`)
            .toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
            .toUpperCase()}
        </span>
        <h2>Your Weekly Reflection</h2>
        <div className="quantix-review-stats">
          <div>
            <strong>
              {stats.minutes} / {store.rules.weeklyTargetMinutes} min
            </strong>
            <small>Weekly study target</small>
          </div>
          <div>
            <strong>
              {stats.attempts} / {store.rules.weeklyTargetProblems}
            </strong>
            <small>Weekly problems target</small>
          </div>
          <div>
            <strong>{stats.accuracy === null ? '—' : `${stats.accuracy}%`}</strong>
            <small>Aggregate accuracy</small>
          </div>
          <div>
            <strong>
              {stats.activeDays} / {store.rules.weeklyTargetPracticeDays}
            </strong>
            <small>Active days · {stats.status}</small>
          </div>
        </div>

        <form className="quantix-form-stack" onSubmit={save}>
          <label className="field-label">
            What went exceptionally well?
            <textarea
              rows={3}
              value={wins}
              onChange={(e) => setWins(e.target.value)}
              placeholder="Breakthroughs, formulas mastered, or milestones reached..."
            />
          </label>
          <label className="field-label">
            What felt challenging?
            <textarea
              rows={3}
              value={difficulties}
              onChange={(e) => setDifficulties(e.target.value)}
              placeholder="Complex edge cases, friction points, or conceptual doubts..."
            />
          </label>
          <label className="field-label">
            What did you learn about your learning?
            <textarea
              rows={3}
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              placeholder="Meta-learning reflections or workflow discoveries..."
            />
          </label>
          <label className="field-label">
            Next week focus priorities
            <textarea
              rows={2}
              value={nextFocus}
              onChange={(e) => setNextFocus(e.target.value)}
              placeholder="Top 1 or 2 high-impact areas..."
            />
          </label>
          <button className="soft-gold-primary-button">
            <Check /> Save Weekly Reflection
          </button>
        </form>
      </article>

      <article className="quantix-panel">
        <span className="panel-kicker">REFLECTIONS ARCHIVE</span>
        <h2>Review History</h2>
        {store.reviews.map((r) => (
          <details className="quantix-review-card" key={r.week}>
            <summary>
              Week of{' '}
              {new Date(`${r.week}T12:00:00`).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              <span>{new Date(r.updatedAt).toLocaleDateString()}</span>
            </summary>
            <p>
              <b>Went well</b>
              <br />
              {r.wins || '—'}
            </p>
            <p>
              <b>Difficulties</b>
              <br />
              {r.difficulties || '—'}
            </p>
            <p>
              <b>Lessons</b>
              <br />
              {r.lessons || '—'}
            </p>
            <p>
              <b>Next focus</b>
              <br />
              {r.nextFocus || '—'}
            </p>
          </details>
        ))}
        {!store.reviews.length && (
          <div className="quantix-empty-state">
            Saved reflections will archive here with preserved weekly stats.
          </div>
        )}
      </article>
    </div>
  )
}

export function GroupsView({
  groups,
  onGroups,
}: {
  groups: string[]
  onGroups: (g: string[]) => void
}) {
  const [name, setName] = useState('')
  const create = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onGroups([...groups, name.trim()])
    setName('')
  }

  return (
    <div className="quantix-two-column reveal">
      <article className="quantix-panel">
        <span className="panel-kicker">COLLABORATIVE CIRCLES</span>
        <h2>Learning Groups</h2>
        <p className="quantix-support-copy">
          Create private study groups and peer circles. Shared invitations and collaborative progress become active with Supabase Auth connected.
        </p>
        <form className="quantix-inline-form" onSubmit={create}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quantum Mechanics Circle"
            aria-label="Group name"
            required
          />
          <button className="soft-gold-primary-button">
            <Plus /> Create Group
          </button>
        </form>
        <div className="quantix-topic-list">
          {groups.map((g) => (
            <div className="quantix-topic-card" key={g}>
              <div className="quantix-topic-glyph">
                <Users />
              </div>
              <div className="quantix-topic-body">
                <strong>{g}</strong>
                <small>Private circle · Stored on this device</small>
              </div>
              <button
                className="row-btn-action danger"
                aria-label="Delete group"
                onClick={() => onGroups(groups.filter((x) => x !== g))}
              >
                <Trash2 />
              </button>
            </div>
          ))}
          {!groups.length && (
            <div className="quantix-empty-state">You have not added any group yet.</div>
          )}
        </div>
      </article>

      <article className="quantix-panel">
        <span className="panel-kicker">DATA SOVEREIGNTY</span>
        <h2>Your Study Records Stay Yours</h2>
        <p className="quantix-support-copy">
          Learning circles will not expose your raw sessions or individual accuracy curves. Explicit granular sharing permissions will govern collaborative hubs.
        </p>
        <div className="quantix-note-box">
          <CircleHelp />
          <span>
            For cloud group synchronization, connect your Supabase backend and verify RLS database policies.
          </span>
        </div>
      </article>
    </div>
  )
}

export function AchievementsView({
  store,
  summary,
}: {
  store: Store
  summary: ReturnType<typeof summarizeSessions>
}) {
  const achievements = [
    {
      title: 'First Steps',
      description: 'Log your first genuine study session record.',
      value: store.sessions.length > 0,
    },
    {
      title: 'Focused Hour',
      description: 'Record at least 60 total minutes of deep learning.',
      value: store.sessions.reduce((n, s) => n + s.minutes, 0) >= 60,
    },
    {
      title: 'Problem Solver',
      description: 'Attempt 10 or more practice problems.',
      value: store.sessions.reduce((n, s) => n + s.attempted, 0) >= 10,
    },
    {
      title: `${store.rules.streakMilestoneDays}-Day Streak`,
      description: `Maintain an active ${store.rules.streakMilestoneDays}-day learning streak. Current best: ${summary.bestStreak} days.`,
      value: summary.milestoneBadges > 0,
    },
    {
      title: 'Curious Mind',
      description: 'Explore and record across 5 distinct topics.',
      value: new Set(store.sessions.map((s) => s.topic)).size >= 5,
    },
    {
      title: 'Weekly Milestone',
      description: `Reach your ${store.rules.weeklyTargetMinutes}-minute weekly study target.`,
      value: summary.weekMinutes >= store.rules.weeklyTargetMinutes,
    },
  ]

  return (
    <>
      <div className="quantix-achievement-banner quantix-panel reveal">
        <div className="achievement-trophy-badge">
          <Trophy />
        </div>
        <div className="banner-copy">
          <span className="panel-kicker">
            LEARNER PROGRESSION · {summary.rank.toUpperCase()}
          </span>
          <h2>
            {summary.totalXp.toLocaleString()} XP · Level {summary.level}
          </h2>
          <p>
            {summary.xpToNextLevel} XP until next rank tier. Every active day awards base XP, correct-answer XP, and daily accuracy bonuses.
          </p>
        </div>
      </div>

      <div className="quantix-achievement-grid reveal">
        {achievements.map((a) => (
          <article
            className={`quantix-panel achievement-card ${a.value ? 'unlocked' : ''}`}
            key={a.title}
          >
            <div className="card-top-row">
              <div className="achievement-icon-chip">
                <Trophy />
              </div>
              <span className="achievement-state-pill">
                {a.value ? 'EARNED' : 'IN PROGRESS'}
              </span>
            </div>
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            {a.value && <Check className="earned-checkmark" />}
          </article>
        ))}
      </div>
    </>
  )
}

export function AssistantView({
  sessions,
  onLog,
}: {
  sessions: Session[]
  onLog: () => void
}) {
  const topicStats = [...new Set(sessions.map((s) => s.topic))]
    .map((topic) => {
      const rows = sessions.filter((s) => s.topic === topic)
      const attempts = rows.reduce((n, s) => n + s.attempted, 0)
      return {
        topic,
        attempts,
        accuracy: attempts
          ? Math.round((rows.reduce((n, s) => n + s.correct, 0) * 100) / attempts)
          : null,
      }
    })
    .filter((t) => t.attempts)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))

  return (
    <div className="quantix-two-column reveal">
      <article className="quantix-panel">
        <div className="quantix-assistant-head">
          <div className="ai-orb-glow">
            <Sparkles />
          </div>
          <div>
            <span className="panel-kicker">LEARNING CUE · TRANSPARENT ENGINE</span>
            <h2>Actionable Study Recommendation</h2>
          </div>
        </div>

        {topicStats.length ? (
          <>
            <p className="quantix-assistant-response">
              Your recorded accuracy is lowest for{' '}
              <strong className="text-gold">{topicStats[0].topic}</strong>
              {topicStats[0].accuracy === null ? '' : ` (${topicStats[0].accuracy}%)`}. We suggest
              a focused 30-minute practice block, logging problem outcomes to reinforce the learning curve.
            </p>
            <button className="soft-gold-primary-button" onClick={onLog}>
              <Plus /> Practice {topicStats[0].topic}
            </button>
          </>
        ) : (
          <>
            <p className="quantix-assistant-response">
              Not enough problem attempts have been logged to highlight a specific focus. Log a session with problem outcomes to activate real-time topic cues.
            </p>
            <button className="soft-gold-primary-button" onClick={onLog}>
              <Plus /> Record Your First Session
            </button>
          </>
        )}

        <div className="quantix-note-box mt-16">
          <CircleHelp />
          <span>
            This transparent cue operates on client-side scoring logic without sending learning data to third-party endpoints.
          </span>
        </div>
      </article>

      <article className="quantix-panel">
        <span className="panel-kicker">CAPABILITY OVERVIEW</span>
        <h2>Grounded in Your Own Data</h2>
        <div className="quantix-focus-list">
          <div className="focus-list-item">
            <span className="focus-glyph">
              <Gauge />
            </span>
            <div>
              <strong>Highlight Lower Accuracy Topics</strong>
              <small>Calculated from verified problem attempts</small>
            </div>
          </div>
          <div className="focus-list-item">
            <span className="focus-glyph">
              <CalendarDays />
            </span>
            <div>
              <strong>Keep a Steady Weekly Rhythm</strong>
              <small>Real-time streak and decay calculations</small>
            </div>
          </div>
          <div className="focus-list-item">
            <span className="focus-glyph">
              <BrainCircuit />
            </span>
            <div>
              <strong>Explain Concepts & Generate Practice</strong>
              <small>Available with backend AI provider integration</small>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}

export function SettingsView({
  store,
  patchStore,
  exportData,
  user,
  syncMessage,
  syncState,
  conflicts,
  onResolveConflict,
  onRetryFailed,
  onImportAnonymous,
  onSendSummary,
}: {
  store: Store
  patchStore: (p: Partial<Store>) => void
  exportData: () => void
  user: User | null
  syncMessage: string
  syncState: SyncState
  conflicts: SyncConflict[]
  onResolveConflict: (conflict: SyncConflict, choice: 'local' | 'remote') => void
  onRetryFailed: () => void
  onImportAnonymous: () => void
  onSendSummary: () => void
}) {
  const [name, setName] = useState(store.name)
  const [rules, setRules] = useState<LearningRules>(store.rules)
  const [saved, setSaved] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState('')
  const [authEvents, setAuthEvents] = useState<{ id: string; event_type: string; occurred_at: string }[]>([])

  useEffect(() => {
    let active = true
    if (!user || !supabase) { setAuthEvents([]); return () => { active = false } }
    void supabase.from('auth_access_audit').select('id,event_type,occurred_at')
      .eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (active) setAuthEvents(data ?? []) })
    return () => { active = false }
  }, [user?.id])

  const updateNumber = (key: keyof LearningRules, value: string) =>
    setRules((old) => ({ ...old, [key]: Number(value) }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (
      rules.developingAccuracy > rules.masteryAccuracy ||
      rules.xpPerLevel < 1 ||
      rules.streakMilestoneDays < 1
    )
      return
    patchStore({ name: name.trim(), rules })
    setSaved(true)
    setProfileSaveError('')
    if (user && supabase) {
      const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', user.id)
      if (error) setProfileSaveError(`Local preference saved, but account profile update failed: ${error.message}`)
    }
    window.setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div className="quantix-two-column reveal">
      <article className="quantix-panel">
        <span className="panel-kicker">PROFILE & GOALS</span>
        <h2>Your Learning Preferences</h2>
        <form className="quantix-form-stack" onSubmit={save}>
          <label className="field-label">
            Learner Display Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How should Menya greet you?"
            />
          </label>
          <div className="modal-form-grid">
            <label className="field-label">
              Weekly Study Minutes
              <input
                type="number"
                min="30"
                max="10080"
                value={rules.weeklyTargetMinutes}
                onChange={(e) => updateNumber('weeklyTargetMinutes', e.target.value)}
              />
            </label>
            <label className="field-label">
              Weekly Practice Days
              <input
                type="number"
                min="1"
                max="7"
                value={rules.weeklyTargetPracticeDays}
                onChange={(e) => updateNumber('weeklyTargetPracticeDays', e.target.value)}
              />
            </label>
            <label className="field-label">
              Weekly Problems Attempted
              <input
                type="number"
                min="0"
                max="10000"
                value={rules.weeklyTargetProblems}
                onChange={(e) => updateNumber('weeklyTargetProblems', e.target.value)}
              />
            </label>
            <label className="field-label">
              Appearance Theme
              <select
                value={store.theme}
                onChange={(e) => patchStore({ theme: e.target.value as Store['theme'] })}
              >
                <option value="dark">Midnight Blue & Soft Gold</option>
                <option value="light">Cloud Light</option>
              </select>
            </label>
          </div>

          <span className="panel-kicker mt-14">SCORING ENGINE RULES · WORKBOOK DEFAULTS</span>
          <div className="modal-form-grid">
            <label className="field-label">
              XP Per Active Day
              <input
                type="number"
                min="0"
                max="1000"
                value={rules.baseXpPerActiveDay}
                onChange={(e) => updateNumber('baseXpPerActiveDay', e.target.value)}
              />
            </label>
            <label className="field-label">
              XP Per Correct Answer
              <input
                type="number"
                min="0"
                max="100"
                value={rules.xpPerCorrectAnswer}
                onChange={(e) => updateNumber('xpPerCorrectAnswer', e.target.value)}
              />
            </label>
            <label className="field-label">
              Mastery Threshold (%)
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round(rules.masteryAccuracy * 100)}
                onChange={(e) =>
                  updateNumber('masteryAccuracy', String(Number(e.target.value) / 100))
                }
              />
            </label>
            <label className="field-label">
              XP Per Level
              <input
                type="number"
                min="1"
                max="100000"
                value={rules.xpPerLevel}
                onChange={(e) => updateNumber('xpPerLevel', e.target.value)}
              />
            </label>
          </div>

          <button className="soft-gold-primary-button" type="submit">
            <Check /> {saved ? 'Preferences Saved' : 'Save Preferences'}
          </button>
          {profileSaveError && <p className="quantix-form-error" role="alert">{profileSaveError}</p>}
        </form>
      </article>

      <div className="settings-right-stack">
        <AuthPanel user={user} syncMessage={syncMessage} />

        {user && <article className="quantix-panel">
          <span className="panel-kicker">ACCOUNT SECURITY</span>
          <h2>Recent account activity</h2>
          <p className="quantix-support-copy">Sign-in and account changes recorded for your account. This log does not store passwords or IP addresses.</p>
          {authEvents.length ? <div className="account-event-list">{authEvents.map((event) => <div className="account-event-row" key={event.id}>
            <span>{event.event_type.replaceAll('_', ' ')}</span>
            <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time>
          </div>)}</div> : <p className="account-event-empty">No account activity is recorded yet.</p>}
        </article>}

        <article className="quantix-panel">
          <span className="panel-kicker">RELIABLE SYNC</span>
          <h2>Sync status: {syncState}</h2>
          <p role="status" aria-live="polite">{syncMessage}</p>
          {user && <button className="control-button full-w" onClick={onImportAnonymous}>Import anonymous device records</button>}
          {user && <button className="control-button full-w" onClick={onSendSummary}>Email me this week’s learning summary</button>}
          <button className="control-button full-w" onClick={onRetryFailed}>Retry failed changes</button>
          {conflicts.map((conflict) => (
            <section className="quantix-note-box mt-14" key={conflict.conflictId} aria-label={`Conflict for ${conflict.entityType} ${conflict.entityId}`}>
              <div>
                <strong>{conflict.entityType} needs a choice</strong>
                <p>Changed in another session. Conflicting fields: {conflict.conflictingPaths.join(', ') || 'independent fields were merged'}.</p>
                <details><summary>Review local and cloud copies</summary><pre>{JSON.stringify({ local: conflict.localPayload, cloud: conflict.remotePayload }, null, 2)}</pre></details>
                <button className="control-button" onClick={() => onResolveConflict(conflict, 'local')}>Keep this device</button>
                <button className="control-button" onClick={() => onResolveConflict(conflict, 'remote')}>Keep cloud</button>
              </div>
            </section>
          ))}
        </article>

        <article className="quantix-panel">
          <span className="panel-kicker">DATA CONTROLS</span>
          <h2>Export & Local Data</h2>
          <div className="settings-actions-stack">
            <button className="control-button full-w" onClick={exportData}>
              <ArrowDownToLine /> Download Learning Data (JSON)
            </button>
          </div>
          <div className="quantix-note-box mt-14">
            <Bell />
            <span>Learning records use protected local storage. Export a backup before managing browser site data.</span>
          </div>
        </article>
      </div>
    </div>
  )
}

export function AuthPanel({ user, syncMessage, onClose, recoveryMode = false, onRecoveryComplete, showStory = false }: { user: User | null; syncMessage: string; onClose?: () => void; recoveryMode?: boolean; onRecoveryComplete?: () => void; showStory?: boolean }) {
  const authContentRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    const root = authContentRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = gsap.context(() => {
      gsap.fromTo(
        root.querySelectorAll('.menya-auth-story, .menya-auth-form-panel'),
        { autoAlpha: 0, y: 22 },
        { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out' },
      )
      gsap.fromTo(
        root.querySelectorAll('.menya-auth-benefits > span'),
        { autoAlpha: 0, x: -12 },
        { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.1, delay: 0.35, ease: 'power2.out' },
      )
      const orbit = root.querySelector('.menya-auth-orbit')
      if (orbit) gsap.to(orbit, { rotation: 360, duration: 48, repeat: -1, ease: 'none' })
    }, root)

    return () => context.revert()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage('')
    try {
      const result = mode === 'create'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { display_name: displayName.trim() } } })
        : await supabase.auth.signInWithPassword({ email, password })
      setMessage(result.error?.message ?? (mode === 'create' ? 'Check your inbox to confirm your account.' : 'Signed in.'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication could not be completed.')
    } finally { setBusy(false) }
  }

  const resetPassword = async () => {
    if (!supabase || !email) { setMessage('Enter your email address first.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      setMessage(error?.message ?? 'If an account exists for that email, a password reset message is on its way.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not request a password reset.') }
    finally { setBusy(false) }
  }

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) setMessage(error.message)
      else {
        void supabase.rpc('record_my_auth_event', { p_event_type: 'password_changed' })
        setMessage('Password updated.')
        onRecoveryComplete?.()
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password could not be updated.') }
    finally { setBusy(false) }
  }

  const signOut = async () => {
    if (!supabase) return
    void supabase.rpc('record_my_auth_event', { p_event_type: 'sign_out' })
    const { error } = await supabase.auth.signOut()
    setMessage(error?.message || 'Signed out.')
  }

  return (
    <div ref={authContentRef} className={`menya-auth-content ${onClose ? 'menya-auth-content-modal' : ''} ${showStory ? 'menya-auth-content-gate' : ''} ${!onClose && !showStory ? 'menya-auth-content-inline' : ''}`}>
      {(onClose || showStory) && <aside className="menya-auth-story">
        <div className="menya-auth-orbit-field" aria-hidden="true">
          <span className="menya-auth-orbit" />
          <span className="menya-auth-orbit-inner" />
          <span className="menya-auth-orbit-core" />
        </div>
        <div className="menya-auth-brand">
          <span className="menya-auth-brand-mark" aria-hidden="true"><img src="/LOGO.png" alt="" /></span>
          <span>MENYA<small>LEARNING PLATFORM</small></span>
        </div>
        <div className="menya-auth-story-copy">
          <span className="panel-kicker">YOUR LEARNING WORKSPACE</span>
          <h2>Keep your progress with you.</h2>
          <p>Sign in to sync your learning records securely with Supabase and continue on another device.</p>
          <div className="menya-auth-benefits"><span><i /> Private to your account</span><span><i /> Works offline, syncs when connected</span><span><i /> Sign up with your own email</span></div>
        </div>
        <small className="menya-auth-promise">Your data stays on this device until you sign in.</small>
      </aside>}
      <article className="quantix-panel menya-auth-form-panel">
      <span className="panel-kicker">{user ? 'ACCOUNT & CLOUD SYNC' : mode === 'create' ? 'CREATE YOUR MENYA ACCOUNT' : 'WELCOME BACK'}</span>
      {onClose && <button className="menya-auth-close" type="button" onClick={onClose} aria-label="Close sign in">×</button>}
      <h2 id={onClose ? 'menya-auth-title' : undefined}>
        {recoveryMode ? 'Update your password' : !supabaseConfigured
          ? 'Connect Supabase Project'
          : user
          ? 'Cloud Account Connected'
          : mode === 'create'
          ? 'Create Cloud Account'
          : 'Sign In to Menya'}
      </h2>
      {recoveryMode ? (
        <form className="quantix-form-stack" onSubmit={updatePassword}>
          <p className="quantix-support-copy">Choose a new password for your MENYA account.</p>
          <label className="field-label">New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          <button className="soft-gold-primary-button full-w" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
          {message && <p className="quantix-form-msg" role="status">{message}</p>}
        </form>
      ) : !supabaseConfigured ? (
        <>
          <p className="quantix-support-copy">
            {supabaseConfigurationError
              ? `${supabaseConfigurationError} MENYA is running in local-only mode until it is corrected.`
              : <>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to{' '}
                <code>.env.local</code> to enable multi-device sync.</>}
          </p>
          <div className="quantix-note-box">
            <CircleHelp />
            <span>Row Level Security (RLS) protects your learning records per account.</span>
          </div>
        </>
      ) : user ? (
        <>
          <div className="menya-account-connected"><span className="menya-connected-indicator" /><div><strong>Supabase account connected</strong><small>{user.email}</small></div></div>
          <p className="quantix-support-copy">
            Your private learning workspace syncs when you are online. {syncMessage || 'Connected.'}
          </p>
          <button className="control-button" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="quantix-support-copy menya-auth-form-intro">{mode === 'create' ? 'Create your account to sync progress between your devices.' : 'Sign in to connect this learning workspace to your Supabase account.'}</p>
          <form className="quantix-form-stack" onSubmit={submit}>
            {mode === 'create' && <label className="field-label">
              Your name
              <input type="text" name="name" autoComplete="name" maxLength={80} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>}
            <label className="field-label">
              Email
              <input
                type="email"
                autoComplete="email"
                name="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field-label">
              Password
              <input
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                name="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="soft-gold-primary-button full-w" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'create' ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <div className="menya-auth-links">
            <button
              className="quiet-link-btn"
              type="button"
              onClick={() => {
                setMode(mode === 'create' ? 'sign-in' : 'create')
                setMessage('')
              }}
            >
              {mode === 'create'
                ? 'Already have an account? Sign in'
                : 'New to MENYA? Create an account'}
            </button>
            {mode === 'sign-in' && <button className="quiet-link-btn" type="button" disabled={busy} onClick={() => void resetPassword()}>Forgot password?</button>}
          </div>
          {message && <p className="quantix-form-msg" role="status">{message}</p>}
        </>
      )}
    </article>
    </div>
  )
}
