import { ArrowDownToLine, BookOpen, CalendarDays, CheckCircle2, Clock3, Flame, Plus, Target, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { topicMastery, type summarizeSessions } from '../../lib/learning-engine'
import type { Store } from '../data/models'

interface DashboardViewProps {
  store: Store
  summary: ReturnType<typeof summarizeSessions>
  onNavigate: (page: any) => void
  onLog: () => void
  onEdit: (s: Store['sessions'][number]) => void
  onDelete: (id: string) => void
  exportData: () => void
}

const colors = ['#00e5ff', '#a855f7', '#ffd700', '#10b981', '#60a5fa']

export function DashboardView({ store, summary, onNavigate, onLog, exportData }: DashboardViewProps) {
  const today = new Date()
  const week = summary.daily.slice(-7)
  const mastery = topicMastery(store.sessions, store.rules)
  const activeTopics = mastery.filter((topic) => topic.attempted > 0)
  const planned = store.plans.filter((plan) => !plan.complete).slice(0, 5)
  const latest = [...store.sessions].sort((a, b) => b.studiedAt.localeCompare(a.studiedAt)).slice(0, 5)
  const maxMinutes = Math.max(1, ...week.map((day) => day.minutes))
  const targetProgress = store.rules.weeklyTargetMinutes > 0
    ? Math.min(100, Math.round((summary.weekMinutes / store.rules.weeklyTargetMinutes) * 100))
    : 0

  return (
    <div className="quantix-dashboard-root">
      <div className="dashboard-action-header reveal">
        <div className="header-left"><h1 className="dashboard-title">Learning dashboard</h1></div>
        <div className="header-controls">
          <span className="control-pill date-pill"><CalendarDays className="control-icon" />{today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <button className="control-button" type="button" onClick={exportData}><ArrowDownToLine className="btn-icon" /><span>Export</span></button>
          <button className="soft-gold-primary-button" type="button" onClick={onLog}><Plus className="btn-icon" /><span>Log Study Session</span></button>
        </div>
      </div>

      <div className="top-stats-grid reveal">
        <Metric title="Learning score" value={String(summary.currentScore)} detail={`Peak score ${summary.peakScore}`} icon={<Target />} tone="violet" />
        <Metric title="Study time this week" value={`${Math.floor(summary.weekMinutes / 60)}h ${summary.weekMinutes % 60}m`} detail={`${summary.weekMinutes} of ${store.rules.weeklyTargetMinutes} min weekly goal`} icon={<Clock3 />} tone="gold" progress={targetProgress} />
        <Metric title="Practice accuracy" value={summary.weekAccuracy === null ? '—' : `${(summary.weekAccuracy * 100).toFixed(1)}%`} detail={`${summary.weekCorrect} correct of ${summary.weekAttempts} attempts this week`} icon={<CheckCircle2 />} tone="cyan" />
      </div>

      <div className="mid-section-grid reveal">
        <section className="dashboard-panel learning-activity-panel">
          <PanelTitle icon={<TrendingUp />} title="Study activity" subtitle="Minutes studied each day · last 7 days" />
          {week.some((day) => day.minutes > 0 || day.attempted > 0) ? (
            <div className="learning-week-chart" role="img" aria-label="Study minutes for the last seven days">
              {week.map((day, index) => {
                const date = new Date(`${day.date}T12:00:00`)
                return <div className="learning-day" key={day.date} title={`${date.toLocaleDateString()}: ${day.minutes} minutes, ${day.attempted} attempts`}>
                  <span className="learning-day-value">{day.minutes ? `${day.minutes}m` : ''}</span>
                  <div className="learning-day-track"><div className="learning-day-fill" style={{ height: `${day.minutes ? Math.max(5, day.minutes / maxMinutes * 100) : 0}%`, background: colors[index % colors.length] }} /></div>
                  <span className="learning-day-label">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                </div>
              })}
            </div>
          ) : <EmptyState title="No study activity this week" detail="Log a session to see your weekly progress here." />}
          <div className="learning-activity-summary">
            <span><Flame size={15} /> {summary.streak} day current streak</span>
            <span>{summary.weekActiveDays} active days</span>
            <span>{summary.weekStatus === '—' ? 'Weekly goal not started' : summary.weekStatus.toLowerCase()}</span>
          </div>
        </section>

        <section className="dashboard-panel topic-progress-panel">
          <PanelTitle icon={<BookOpen />} title="Topic progress" subtitle="Based on your recorded practice" />
          {activeTopics.length ? <div className="topic-progress-list">
            {activeTopics.slice(0, 6).map((topic, index) => <div className="topic-progress-row" key={topic.topic}>
              <div className="topic-progress-copy"><strong>{topic.topic}</strong><span>{topic.accuracy === null ? 'No scored attempts' : `${Math.round(topic.accuracy * 100)}% accuracy`} · {topic.attempted} attempts</span></div>
              <div className="topic-progress-track"><div style={{ width: `${Math.round((topic.accuracy ?? 0) * 100)}%`, background: colors[index % colors.length] }} /></div>
              <small>{topic.status === 'MASTERED' ? 'Mastered' : topic.status === 'DEVELOPING' ? 'Building' : 'Focus'}</small>
            </div>)}
          </div> : <EmptyState title="Topic progress appears after practice" detail="Record problem attempts to see accuracy and mastery by topic." />}
          <button className="dashboard-text-link" type="button" onClick={() => onNavigate('My Learning')}>View my learning</button>
        </section>
      </div>

      <div className="bottom-section-grid reveal">
        <section className="dashboard-panel upcoming-panel">
          <PanelTitle icon={<CalendarDays />} title="Planned sessions" subtitle="Your upcoming study plan" />
          {planned.length ? <div className="dashboard-list">{planned.map((plan) => <div className="dashboard-list-row" key={plan.id}>
            <div><strong>{plan.topic}</strong><small>{new Date(`${plan.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>
            <span>{plan.minutes} min</span>
          </div>)}</div> : <EmptyState title="No upcoming sessions" detail="Add a session in Study Planner to keep your next steps visible." />}
          <button className="dashboard-text-link" type="button" onClick={() => onNavigate('Study Planner')}>Open study planner</button>
        </section>

        <section className="dashboard-panel recent-sessions-panel">
          <PanelTitle icon={<Clock3 />} title="Recent study sessions" subtitle="Your latest recorded work" />
          {latest.length ? <div className="dashboard-list">{latest.map((session) => <div className="dashboard-list-row" key={session.id}>
            <div><strong>{session.topic}</strong><small>{new Date(session.studiedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {session.method || session.subject}</small></div>
            <span>{session.minutes} min{session.attempted ? ` · ${session.correct}/${session.attempted}` : ''}</span>
          </div>)}</div> : <EmptyState title="No sessions recorded yet" detail="Your study history will appear here after your first session." />}
        </section>
      </div>
    </div>
  )
}

function Metric({ title, value, detail, icon, tone, progress }: { title: string; value: string; detail: string; icon: ReactNode; tone: string; progress?: number }) {
  return <article className="stat-card learning-metric-card">
    <div className="stat-card-head"><div className="head-left"><span className={`card-glyph-icon ${tone}`}>{icon}</span><span className="card-title-text">{title}</span></div></div>
    <div className="learning-metric-value">{value}</div>
    <div className="learning-metric-detail">{detail}</div>
    {progress !== undefined && <div className="learning-goal-track" aria-label={`${progress}% of weekly goal`}><div style={{ width: `${progress}%` }} /></div>}
  </article>
}

function PanelTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="panel-top-bar"><div className="panel-title-area"><span className="panel-glyph-icon">{icon}</span><div className="panel-headings"><h3>{title}</h3><small className="dashboard-panel-subtitle">{subtitle}</small></div></div></div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="dashboard-empty-state"><strong>{title}</strong><span>{detail}</span></div>
}
