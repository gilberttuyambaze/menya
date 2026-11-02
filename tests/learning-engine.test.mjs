import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_LEARNING_RULES, localDateKey, summarizeSessions, summarizeWeek, topicMastery, validateStudySession } from '../lib/learning-engine.ts'

const date = (day) => `2026-09-${String(day).padStart(2, '0')}`
const localNoon = (key) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12).toISOString()
}
const session = (id, day, overrides = {}) => ({
  id, topic: 'Mechanics', minutes: 25, attempted: 6, correct: 5,
  studiedAt: localNoon(day), ...overrides,
})
const summarize = (sessions, nowDay, rules = DEFAULT_LEARNING_RULES) => summarizeSessions(
  sessions,
  rules,
  new Date(`${nowDay}T12:00:00`),
)

test('workbook reference example awards 28 XP for the day', () => {
  const result = summarize([session('a', '2026-10-13')], '2026-10-13')
  assert.equal(result.totalXp, 28)
  assert.equal(result.currentScore, 28)
  assert.equal(result.streak, 1)
})

test('multiple sessions on one day aggregate before accuracy and XP', () => {
  const sessions = [
    session('a', date(14), { minutes: 10, attempted: 2, correct: 1 }),
    session('b', date(14), { minutes: 15, attempted: 4, correct: 4 }),
  ]
  const result = summarize(sessions, date(14))
  assert.equal(result.daily.at(-1).sessions, 2)
  assert.equal(result.daily.at(-1).minutes, 25)
  assert.equal(result.daily.at(-1).accuracy, 5 / 6)
  assert.equal(result.totalXp, 28)
})

test('a minutes-only active day earns base XP without an accuracy bonus', () => {
  const result = summarize([session('a', date(14), { attempted: 0, correct: 0 })], date(14))
  assert.equal(result.daily.at(-1).active, true)
  assert.equal(result.daily.at(-1).accuracy, null)
  assert.equal(result.totalXp, DEFAULT_LEARNING_RULES.baseXpPerActiveDay)
})

test('accuracy aggregates correct and attempted counts across all records', () => {
  const result = summarize([
    session('a', date(14), { attempted: 2, correct: 1 }),
    session('b', date(15), { attempted: 3, correct: 3 }),
  ], date(15))
  assert.equal(result.accuracy, 4 / 5)
})

test('duplicate session IDs are counted once, using the last synchronized version', () => {
  const original = session('same-id', date(14))
  const changed = { ...original, correct: 6 }
  const result = summarize([original, original, changed], date(14))
  assert.equal(result.sessions, 1)
  assert.equal(result.totalAttempts, 6)
  assert.equal(result.totalCorrect, 6)
})

test('editing a historical session recomputes XP and score from source records', () => {
  const before = session('a', date(14), { attempted: 2, correct: 1 })
  const after = { ...before, attempted: 4, correct: 4 }
  assert.notEqual(summarize([before], date(14)).totalXp, summarize([after], date(14)).totalXp)
})

test('deleting a session removes its derived XP and active day', () => {
  const result = summarize([], date(14))
  assert.equal(result.totalXp, 0)
  assert.equal(result.activeDays, 0)
})

test('active consecutive days continue a streak; an empty past day breaks it', () => {
  const sessions = [session('a', date(14)), session('b', date(15))]
  assert.equal(summarize(sessions, date(15)).streak, 2)
  assert.equal(summarize(sessions, date(17)).streak, 0)
  assert.equal(summarize(sessions, date(17)).bestStreak, 2)
})

test('an empty current day remains pending and preserves yesterday streak', () => {
  const result = summarize([session('a', date(14))], date(15))
  assert.equal(result.streak, 1)
  assert.equal(result.daily.at(-1).pending, true)
})

test('missed past days decay score to a floor of zero without changing XP', () => {
  const sessions = [session('a', date(14), { attempted: 0, correct: 0 }), session('b', date(16), { attempted: 0, correct: 0 })]
  const result = summarize(sessions, date(16))
  assert.equal(result.totalXp, 20)
  assert.equal(result.currentScore, 15)
  const empty = summarize([], date(17))
  assert.equal(empty.currentScore, 0)
})

test('weekly targets require both practice days and attempts', () => {
  const enoughDays = Array.from({ length: 5 }, (_, index) => session(`s${index}`, date(14 + index), { attempted: 3, correct: 2 }))
  assert.equal(summarize(enoughDays, date(18)).weekStatus, 'ON TARGET')
  assert.equal(summarize(enoughDays.slice(0, 4), date(18)).weekStatus, 'BUILDING')
})

test('a completed empty week is MISSED; an empty current week remains pending', () => {
  assert.equal(summarizeWeek([], '2026-09-14', DEFAULT_LEARNING_RULES, new Date('2026-09-21T12:00:00')).status, 'MISSED')
  assert.equal(summarizeWeek([], '2026-09-14', DEFAULT_LEARNING_RULES, new Date('2026-09-20T12:00:00')).status, '—')
})

test('topic mastery uses pooled accuracy and no-data topics remain unclassified', () => {
  const sessions = [
    session('a', date(14), { topic: 'Mastered', attempted: 5, correct: 4 }),
    session('b', date(15), { topic: 'Developing', attempted: 5, correct: 3 }),
    session('c', date(16), { topic: 'Focus', attempted: 5, correct: 2 }),
    session('d', date(17), { topic: 'No Data', attempted: 0, correct: 0 }),
  ]
  const statuses = Object.fromEntries(topicMastery(sessions, DEFAULT_LEARNING_RULES).map((row) => [row.topic, row.status]))
  assert.deepEqual(statuses, { Focus: 'FOCUS', Developing: 'DEVELOPING', Mastered: 'MASTERED', 'No Data': 'NO DATA' })
})

test('levels and rank use cumulative XP thresholds', () => {
  const rules = { ...DEFAULT_LEARNING_RULES, baseXpPerActiveDay: 100, xpPerCorrectAnswer: 0, maxDailyAccuracyBonus: 0 }
  const result = summarize([session('a', date(14), { attempted: 0, correct: 0 })], date(14), rules)
  assert.equal(result.level, 2)
  assert.equal(result.rank, 'Cadet')
  assert.equal(result.xpToNextLevel, 100)
})

test('sessions before program start count in lifetime totals but not XP or streak', () => {
  const result = summarize([session('early', '2026-09-13')], '2026-09-14')
  assert.equal(result.totalMinutes, 25)
  assert.equal(result.totalXp, 0)
  assert.equal(result.streak, 0)
})

test('local date keys preserve dates entered at local midnight boundaries', () => {
  const enteredAtLocalEndOfDay = new Date(2026, 8, 14, 23, 59).toISOString()
  assert.equal(localDateKey(new Date(enteredAtLocalEndOfDay)), date(14))
})

test('input validation rejects impossible dates, durations, counts, and inactive rows', () => {
  const valid = { topic: 'Mechanics', date: date(14), minutes: 25, attempted: 6, correct: 5 }
  assert.equal(validateStudySession(valid), null)
  assert.match(validateStudySession({ ...valid, date: '2026-02-30' }), /valid study date/)
  assert.match(validateStudySession({ ...valid, minutes: 1441 }), /Minutes/)
  assert.match(validateStudySession({ ...valid, attempted: 2.5 }), /attempted/)
  assert.match(validateStudySession({ ...valid, correct: 7 }), /no greater/)
  assert.match(validateStudySession({ ...valid, minutes: 0, attempted: 0, correct: 0 }), /study minutes/)
})
