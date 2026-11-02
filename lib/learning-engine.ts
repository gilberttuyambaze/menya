export type StudySession = {
  id: string
  topic: string
  minutes: number
  attempted: number
  correct: number
  studiedAt: string
  reflection?: string
}

export type StudySessionInput = Pick<StudySession, 'topic' | 'minutes' | 'attempted' | 'correct'> & { date: string }

export function validateStudySession(input: StudySessionInput): string | null {
  const { topic, date, minutes, attempted, correct } = input
  if (!topic.trim() || topic.trim().length > 120) return 'Enter a topic between 1 and 120 characters.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter a valid study date.'
  const parsedDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime()) || localDateKey(parsedDate) !== date) return 'Enter a valid study date.'
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return 'Minutes must be a whole number from 0 to 1440.'
  if (!Number.isInteger(attempted) || attempted < 0 || attempted > 2_147_483_647) return 'Problems attempted must be a valid non-negative whole number.'
  if (!Number.isInteger(correct) || correct < 0 || correct > attempted) return 'Correct problems must be a whole number no greater than attempted.'
  if (minutes === 0 && attempted === 0) return 'Record study minutes or at least one attempted problem.'
  return null
}

export type RankRule = { level: number; title: string }
export type LearningRules = {
  programStartDate: string
  baseXpPerActiveDay: number
  xpPerCorrectAnswer: number
  maxDailyAccuracyBonus: number
  missedDayScoreDecay: number
  weeklyTargetPracticeDays: number
  weeklyTargetProblems: number
  weeklyTargetMinutes: number
  streakMilestoneDays: number
  masteryAccuracy: number
  developingAccuracy: number
  xpPerLevel: number
  ranks: RankRule[]
}

// Defaults transcribed from the workbook's Setup sheet. Targets marked as added
// assumptions in that sheet are included here as editable defaults, not facts.
export const DEFAULT_LEARNING_RULES: LearningRules = {
  programStartDate: '2026-09-14',
  baseXpPerActiveDay: 10,
  xpPerCorrectAnswer: 2,
  maxDailyAccuracyBonus: 10,
  missedDayScoreDecay: 5,
  weeklyTargetPracticeDays: 5,
  weeklyTargetProblems: 15,
  weeklyTargetMinutes: 180,
  streakMilestoneDays: 7,
  masteryAccuracy: 0.8,
  developingAccuracy: 0.6,
  xpPerLevel: 100,
  ranks: [
    { level: 1, title: 'Cadet' }, { level: 3, title: 'Navigator' },
    { level: 5, title: 'Operator' }, { level: 8, title: 'Specialist' },
    { level: 12, title: 'Commander' }, { level: 18, title: 'Architect' },
  ],
}

export type DailyResult = {
  date: string
  sessions: number
  minutes: number
  attempted: number
  correct: number
  accuracy: number | null
  active: boolean
  pending: boolean
  xp: number
  streak: number
  score: number
}
export type WeekSummary = { weekStart: string; weekEnd: string; minutes: number; attempts: number; correct: number; accuracy: number | null; sessions: number; activeDays: number; status: 'ON TARGET' | 'BUILDING' | 'MISSED' | '—' }

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function sessionAccuracy(session: Pick<StudySession, 'attempted' | 'correct'>) {
  return session.attempted > 0 ? session.correct / session.attempted : null
}

export function dailyXp(accuracy: number | null, correct: number, rules: LearningRules) {
  return rules.baseXpPerActiveDay + correct * rules.xpPerCorrectAnswer + Math.round((accuracy ?? 0) * rules.maxDailyAccuracyBonus)
}

export function topicMastery(sessions: StudySession[], rules: LearningRules) {
  const grouped = new Map<string, StudySession[]>()
  for (const session of uniqueSessions(sessions)) grouped.set(session.topic, [...(grouped.get(session.topic) ?? []), session])
  return [...grouped.entries()].map(([topic, rows]) => {
    const attempted = rows.reduce((sum, session) => sum + session.attempted, 0)
    const correct = rows.reduce((sum, session) => sum + session.correct, 0)
    const accuracy = attempted ? correct / attempted : null
    const status = accuracy === null ? 'NO DATA' : accuracy >= rules.masteryAccuracy ? 'MASTERED' : accuracy >= rules.developingAccuracy ? 'DEVELOPING' : 'FOCUS'
    return { topic, sessions: rows.length, attempted, correct, minutes: rows.reduce((sum, s) => sum + s.minutes, 0), accuracy, status }
  }).sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2) || a.topic.localeCompare(b.topic))
}

export function summarizeWeek(sessions: StudySession[], weekStart: string, rules: LearningRules = DEFAULT_LEARNING_RULES, now = new Date()): WeekSummary {
  const today = localDateKey(now)
  const weekEnd = addDays(weekStart, 6)
  const visibleEnd = weekEnd < today ? weekEnd : today
  const rows = uniqueSessions(sessions).filter((session) => {
    const day = localDateKey(new Date(session.studiedAt))
    return day >= weekStart && day <= visibleEnd
  })
  const attempts = rows.reduce((sum, session) => sum + session.attempted, 0)
  const correct = rows.reduce((sum, session) => sum + session.correct, 0)
  const activeDays = new Set(rows.filter((session) => session.minutes > 0 || session.attempted > 0)
    .map((session) => localDateKey(new Date(session.studiedAt))))
  const days = activeDays.size
  const minutes = rows.reduce((sum, session) => sum + session.minutes, 0)
  const status = days >= rules.weeklyTargetPracticeDays && attempts >= rules.weeklyTargetProblems
    ? 'ON TARGET'
    : days > 0 || attempts > 0 ? 'BUILDING' : weekEnd < today ? 'MISSED' : '—'
  return { weekStart, weekEnd, minutes, attempts, correct, accuracy: attempts ? correct / attempts : null, sessions: rows.length, activeDays: days, status }
}

export function summarizeSessions(sessions: StudySession[], rules: LearningRules = DEFAULT_LEARNING_RULES, now = new Date()) {
  sessions = uniqueSessions(sessions)
  const today = localDateKey(now)
  const grouped = new Map<string, StudySession[]>()
  for (const session of sessions) {
    const date = localDateKey(new Date(session.studiedAt))
    grouped.set(date, [...(grouped.get(date) ?? []), session])
  }
  const start = rules.programStartDate
  const dates: DailyResult[] = []
  let streak = 0
  let score = 0
  let bestStreak = 0
  let peakScore = 0
  let totalXp = 0
  if (start <= today) {
    const cursor = dateFromKey(start)
    while (localDateKey(cursor) <= today) {
      const date = localDateKey(cursor)
      const daySessions = grouped.get(date) ?? []
      const minutes = daySessions.reduce((sum, session) => sum + session.minutes, 0)
      const attempted = daySessions.reduce((sum, session) => sum + session.attempted, 0)
      const correct = daySessions.reduce((sum, session) => sum + session.correct, 0)
      const accuracy = attempted > 0 ? correct / attempted : null
      const active = minutes > 0 || attempted > 0
      const pending = date === today && !active
      const xp = active ? dailyXp(accuracy, correct, rules) : 0
      if (active) { streak += 1; score += xp; totalXp += xp }
      else if (!pending) { streak = 0; score = Math.max(0, score - rules.missedDayScoreDecay) }
      bestStreak = Math.max(bestStreak, streak)
      peakScore = Math.max(peakScore, score)
      dates.push({ date, sessions: daySessions.length, minutes, attempted, correct, accuracy, active, pending, xp, streak, score })
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  const startOfWeek = new Date(now)
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7))
  const weekStart = localDateKey(startOfWeek)
  const week = summarizeWeek(sessions, weekStart, rules, now)
  const attempts = sessions.reduce((sum, session) => sum + session.attempted, 0)
  const correct = sessions.reduce((sum, session) => sum + session.correct, 0)
  const level = Math.floor(totalXp / Math.max(1, rules.xpPerLevel)) + 1
  const rank = [...rules.ranks].sort((a, b) => a.level - b.level).filter((item) => item.level <= level).at(-1)?.title ?? 'Cadet'
  const current = dates.at(-1)
  const activeDays = dates.filter((day) => day.active).length
  const elapsedDays = dates.length
  return {
    totalXp, currentScore: current?.score ?? 0, peakScore, streak: current?.streak ?? 0,
    bestStreak, milestoneBadges: Math.floor(bestStreak / Math.max(1, rules.streakMilestoneDays)),
    daysToMilestone: rules.streakMilestoneDays - ((current?.streak ?? 0) % Math.max(1, rules.streakMilestoneDays)),
    level, rank, xpIntoLevel: totalXp % Math.max(1, rules.xpPerLevel), xpToNextLevel: rules.xpPerLevel - (totalXp % Math.max(1, rules.xpPerLevel)),
    weekMinutes: week.minutes, weekAttempts: week.attempts, weekCorrect: week.correct, weekActiveDays: week.activeDays, weekAccuracy: week.accuracy, weekStatus: week.status,
    totalMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0), totalAttempts: attempts, totalCorrect: correct,
    accuracy: attempts ? correct / attempts : null, sessions: sessions.length, activeDays, elapsedDays,
    consistency: elapsedDays ? activeDays / elapsedDays : 0,
    studyDays: new Set(sessions.map((session) => localDateKey(new Date(session.studiedAt)))).size,
    todaySessions: grouped.get(today)?.length ?? 0,
    daily: dates,
  }
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(key: string, days: number) {
  const date = dateFromKey(key)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function uniqueSessions(sessions: StudySession[]) {
  const byId = new Map<string, StudySession>()
  for (const session of sessions) byId.set(session.id, session)
  return [...byId.values()]
}
